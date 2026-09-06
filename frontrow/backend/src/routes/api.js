// The whole HTTP API. It is deliberately small: the client asks for a day, a
// competition, a team or a match, and everything else it needs arrives on the
// SSE stream.

import express from 'express';
import { getDb } from '../db/database.js';
import * as repo from '../db/repo.js';
import * as hub from '../realtime/hub.js';
import * as push from '../services/push.js';
import * as ha from '../services/ha.js';
import { computeTable, topScorers, topAssists } from '../sync/standings.js';
import { tick, status as syncStatus, urgency } from '../sync/scheduler.js';
import { syncMatchDetail } from '../sync/engine.js';
import { MATCH_SELECT, matchJson, teamJson, eventJson, competitionJson, listTeamsJson } from './serialize.js';
import { router as crestRouter } from './crest.js';
import { localDate, addDays, nowIso } from '../util/time.js';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('api');
export const router = express.Router();

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const profileId = (req) => String(req.query.profile || req.get('X-Frontrow-Profile') || 'default');

// Crests are proxied and cached on the Pi so no browser ever talks to a CDN.
router.use('/crest', crestRouter);

// ------------------------------------------------------------------- system
/**
 * The Supervisor's watchdog probes this every two minutes and restarts the app
 * after two consecutive failures, so it deliberately touches SQLite: a process
 * that is listening but cannot read its own database is not healthy.
 */
router.get('/health', (req, res) => {
  try {
    const row = getDb().prepare('SELECT COUNT(*) AS n FROM competitions').get();
    res.json({
      ok: true, at: nowIso(), version: '1.0.0',
      demo: config.demoMode, competitions: row.n, clients: hub.clientCount(),
    });
  } catch (err) {
    res.status(503).json({ ok: false, error: String(err.message || err) });
  }
});

/**
 * Everything the app needs to render its first frame: who you are, what you
 * follow, which competitions exist, every team with its colours, and the push
 * key. One request, then the UI is interactive.
 */
router.get('/bootstrap', wrap((req, res) => {
  const id = profileId(req);
  const profile = repo.getProfile(id) || repo.ensureDefaultProfile();
  res.json({
    profile: {
      id: profile.id, name: profile.name, emoji: profile.emoji,
      favouriteTeamId: profile.favourite_team_id, locale: profile.locale,
      theme: profile.theme, reduceMotion: !!profile.reduce_motion,
      spoilerFree: !!profile.spoiler_free,
    },
    profiles: repo.listProfiles().map((p) => ({
      id: p.id, name: p.name, emoji: p.emoji, favouriteTeamId: p.favourite_team_id,
    })),
    follows: repo.listFollows(profile.id).map((f) => ({
      kind: f.kind, id: f.target_id, alerts: safeJson(f.alerts, {}),
    })),
    competitions: repo.listCompetitions().map((c) => competitionJson(c, profile.locale)),
    teams: listTeamsJson(),
    push: { publicKey: push.publicKey(), secureContextRequired: true },
    server: {
      demo: config.demoMode,
      timezone: config.timezone,
      homeAssistant: ha.isAvailable(),
      locale: config.locale,
    },
  });
}));

router.get('/status', wrap((req, res) => {
  res.json({ sync: syncStatus(), clients: hub.clientCount(), seq: hub.currentSeq() });
}));

router.get('/stream', (req, res) => hub.attach(req, res));

// ------------------------------------------------------------------ matches
/**
 * The one endpoint the app leans on.
 *   ?date=2026-09-06        a single Dutch calendar day
 *   ?from=…&to=…            a range
 *   ?competition=eredivisie
 *   ?team=ajax
 *   ?following=1            only what this profile follows
 *   ?status=live
 */
router.get('/matches', wrap((req, res) => {
  const db = getDb();
  const where = [];
  const params = [];

  if (req.query.date) {
    where.push("date(m.kickoff_utc, 'localtime') = ?");
    params.push(req.query.date);
  } else if (req.query.from || req.query.to) {
    where.push("date(m.kickoff_utc, 'localtime') BETWEEN ? AND ?");
    params.push(req.query.from || '1900-01-01', req.query.to || '2100-01-01');
  }

  if (req.query.competition) { where.push('m.competition_id = ?'); params.push(req.query.competition); }
  if (req.query.team) { where.push('(m.home_team_id = ? OR m.away_team_id = ?)'); params.push(req.query.team, req.query.team); }
  if (req.query.status) {
    const list = String(req.query.status).split(',');
    where.push(`m.status IN (${list.map(() => '?').join(',')})`);
    params.push(...list);
  }

  if (req.query.following === '1') {
    const follows = repo.listFollows(profileId(req));
    const teams = follows.filter((f) => f.kind === 'team').map((f) => f.target_id);
    const comps = follows.filter((f) => f.kind === 'competition').map((f) => f.target_id);
    const clauses = [];
    if (teams.length) {
      clauses.push(`m.home_team_id IN (${teams.map(() => '?').join(',')})`);
      clauses.push(`m.away_team_id IN (${teams.map(() => '?').join(',')})`);
      params.push(...teams, ...teams);
    }
    if (comps.length) {
      clauses.push(`m.competition_id IN (${comps.map(() => '?').join(',')})`);
      params.push(...comps);
    }
    where.push(clauses.length ? `(${clauses.join(' OR ')})` : '1 = 0');
  }

  const limit = Math.min(Number(req.query.limit) || 250, 500);
  const rows = db.prepare(`${MATCH_SELECT}
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY m.kickoff_utc, c.sort_order, h.name
    LIMIT ?`).all(...params, limit);

  res.json({ matches: rows.map(matchJson) });
}));

/** The day view: matches grouped by competition, plus what is on either side. */
router.get('/day/:date', wrap((req, res) => {
  const db = getDb();
  const date = req.params.date === 'today' ? localDate() : req.params.date;
  const rows = db.prepare(`${MATCH_SELECT}
    WHERE date(m.kickoff_utc, 'localtime') = ?
    ORDER BY c.sort_order, m.kickoff_utc, h.name`).all(date);

  const groups = [];
  for (const row of rows) {
    let g = groups.find((x) => x.competition.id === row.competition_id);
    if (!g) {
      g = { competition: { id: row.competition_id, name: row.competition_name, abbr: row.competition_abbr, accent: row.competition_accent }, matches: [] };
      groups.push(g);
    }
    g.matches.push(matchJson(row));
  }

  // Which nearby days have football, so the date strip can show dots.
  const busy = db.prepare(`
    SELECT date(kickoff_utc, 'localtime') AS d, COUNT(*) AS n,
           SUM(CASE WHEN status IN ('live','halftime') THEN 1 ELSE 0 END) AS live
    FROM matches
    WHERE date(kickoff_utc, 'localtime') BETWEEN ? AND ?
    GROUP BY d`).all(addDays(date, -10), addDays(date, 10));

  res.json({ date, groups, days: busy, live: urgency() });
}));

router.get('/matches/:id', wrap(async (req, res) => {
  const db = getDb();
  const row = db.prepare(`${MATCH_SELECT} WHERE m.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'not_found' });

  // A match page is worth one on-demand detail fetch if we have never done it.
  if (!row.has_lineups && row.status !== 'scheduled') {
    await syncMatchDetail(row.id).catch(() => {});
  }

  const events = repo.eventsFor(row.id).map(eventJson);
  const lineups = db.prepare('SELECT * FROM lineups WHERE match_id = ? ORDER BY is_starter DESC, shirt').all(row.id);
  const formations = db.prepare('SELECT * FROM formations WHERE match_id = ?').all(row.id);
  const stats = db.prepare('SELECT * FROM match_stats WHERE match_id = ?').all(row.id);

  const bySide = (teamId) => (teamId === row.home_team_id ? 'home' : 'away');
  const head2head = db.prepare(`${MATCH_SELECT}
    WHERE ((m.home_team_id = ? AND m.away_team_id = ?) OR (m.home_team_id = ? AND m.away_team_id = ?))
      AND m.status = 'finished' AND m.id != ?
    ORDER BY m.kickoff_utc DESC LIMIT 6`)
    .all(row.home_team_id, row.away_team_id, row.away_team_id, row.home_team_id, row.id);

  res.json({
    match: matchJson(row),
    events,
    lineups: ['home', 'away'].map((side) => {
      const teamId = side === 'home' ? row.home_team_id : row.away_team_id;
      const f = formations.find((x) => x.team_id === teamId);
      return {
        side, teamId, formation: f?.formation || null, coach: f?.coach || null,
        players: lineups.filter((p) => p.team_id === teamId).map((p) => ({
          name: p.player_name, shirt: p.shirt, position: p.position,
          starter: !!p.is_starter, captain: !!p.is_captain, rating: p.rating,
        })),
      };
    }),
    stats: stats.map((s) => ({ side: bySide(s.team_id), metric: s.metric, value: s.value })),
    head2head: head2head.map(matchJson),
  });
}));

// ---------------------------------------------------------------- standings
router.get('/standings/:competitionId', wrap((req, res) => {
  const db = getDb();
  const competition = repo.getCompetition(req.params.competitionId);
  if (!competition) return res.status(404).json({ error: 'not_found' });
  const season = repo.currentSeason(competition.id);
  if (!season) return res.json({ competition: competitionJson(competition), table: [] });

  const live = req.query.live === '1';
  const rows = live
    ? computeTable(season.id, { includeLive: true })
    : db.prepare(`
        SELECT s.*, t.name, t.short_name, t.code, t.crest_url, t.primary_color, t.secondary_color
        FROM standings s JOIN teams t ON t.id = s.team_id
        WHERE s.season_id = ? AND s.group_key = '' ORDER BY s.position`).all(season.id);

  res.json({
    competition: competitionJson(competition),
    season: { id: season.id, label: season.label },
    live,
    table: rows.map((r) => ({
      position: r.position,
      previousPosition: r.prev_position ?? null,
      zone: r.zone ?? null,
      team: {
        id: r.team_id, name: r.name, short: r.short_name, code: r.code,
        crest: r.crest_url, color: r.primary_color, color2: r.secondary_color,
      },
      played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
      goalsFor: r.goals_for, goalsAgainst: r.goals_against,
      goalDiff: r.goal_diff ?? (r.goals_for - r.goals_against),
      points: r.points, form: r.form || '',
    })),
  });
}));

router.get('/scorers/:competitionId', wrap((req, res) => {
  const season = repo.currentSeason(req.params.competitionId);
  if (!season) return res.json({ scorers: [], assists: [] });
  res.json({
    season: { id: season.id, label: season.label },
    scorers: topScorers(season.id, Number(req.query.limit) || 20),
    assists: topAssists(season.id, Number(req.query.limit) || 20),
  });
}));

// -------------------------------------------------------------------- teams
router.get('/teams', wrap((req, res) => res.json({ teams: listTeamsJson() })));

router.get('/teams/:id', wrap((req, res) => {
  const db = getDb();
  const team = repo.getTeam(req.params.id);
  if (!team) return res.status(404).json({ error: 'not_found' });

  const matches = db.prepare(`${MATCH_SELECT}
    WHERE m.home_team_id = ? OR m.away_team_id = ?
    ORDER BY m.kickoff_utc`).all(team.id, team.id);

  const finished = matches.filter((m) => m.status === 'finished');
  const upcoming = matches.filter((m) => m.status === 'scheduled').slice(0, 8);

  const standing = db.prepare(`
    SELECT s.*, c.id AS competition_id, c.short_name AS competition_name
    FROM standings s JOIN seasons se ON se.id = s.season_id
    JOIN competitions c ON c.id = se.competition_id
    WHERE s.team_id = ? AND se.is_current = 1`).get(team.id);

  const scorers = db.prepare(`
    SELECT e.player_name AS player, COUNT(*) AS goals
    FROM match_events e JOIN matches m ON m.id = e.match_id
    WHERE e.team_id = ? AND e.type IN ('goal','penalty') AND e.player_name IS NOT NULL
      AND m.kickoff_utc > date('now', '-1 year')
    GROUP BY e.player_name ORDER BY goals DESC LIMIT 8`).all(team.id);

  res.json({
    team: teamJson(team),
    standing: standing ? {
      competitionId: standing.competition_id, competitionName: standing.competition_name,
      position: standing.position, points: standing.points, played: standing.played,
      form: standing.form, zone: standing.zone,
    } : null,
    form: finished.slice(-8).map((m) => ({
      matchId: m.id,
      result: resultFor(m, team.id),
      opponent: m.home_team_id === team.id ? m.away_short : m.home_short,
      home: m.home_team_id === team.id,
      score: `${m.home_score}-${m.away_score}`,
      kickoff: m.kickoff_utc,
    })),
    results: finished.slice(-15).reverse().map(matchJson),
    fixtures: upcoming.map(matchJson),
    topScorers: scorers,
  });
}));

const resultFor = (m, teamId) => {
  const isHome = m.home_team_id === teamId;
  const mine = isHome ? m.home_score : m.away_score;
  const theirs = isHome ? m.away_score : m.home_score;
  if (mine == null) return null;
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
};

// ------------------------------------------------------------------ profile
router.patch('/profile', wrap((req, res) => {
  const db = getDb();
  const id = profileId(req);
  const allowed = ['name', 'emoji', 'favourite_team_id', 'locale', 'theme', 'reduce_motion', 'spoiler_free'];
  const patch = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    const col = k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
    if (allowed.includes(col)) patch[col] = typeof v === 'boolean' ? (v ? 1 : 0) : v;
  }
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'nothing_to_update' });
  db.prepare(`UPDATE profiles SET ${Object.keys(patch).map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`)
    .run({ ...patch, id });

  // Switching your favourite club also switches what you follow — that is the
  // whole point of picking one.
  if (patch.favourite_team_id) repo.followTeam(id, patch.favourite_team_id);
  res.json({ profile: repo.getProfile(id) });
}));

router.get('/follows', wrap((req, res) => {
  res.json({
    follows: repo.listFollows(profileId(req)).map((f) => ({
      kind: f.kind, id: f.target_id, alerts: safeJson(f.alerts, {}),
    })),
  });
}));

router.post('/follows', wrap((req, res) => {
  const { kind, id, alerts } = req.body || {};
  if (!['team', 'competition'].includes(kind) || !id) return res.status(400).json({ error: 'bad_request' });
  repo.follow(profileId(req), kind, id, alerts);
  res.json({ ok: true });
}));

router.delete('/follows/:kind/:id', wrap((req, res) => {
  repo.unfollow(profileId(req), req.params.kind, req.params.id);
  res.json({ ok: true });
}));

// ------------------------------------------------------------ notifications
router.get('/notifications/status', wrap((req, res) => {
  res.json({
    publicKey: push.publicKey(),
    devices: push.subscriptionsFor(profileId(req)).length,
    homeAssistant: ha.isAvailable(),
  });
}));

router.post('/notifications/subscribe', wrap((req, res) => {
  const { subscription } = req.body || {};
  if (!subscription?.endpoint || !subscription?.keys) return res.status(400).json({ error: 'bad_subscription' });
  push.subscribe(profileId(req), subscription, req.get('User-Agent'));
  res.json({ ok: true });
}));

router.post('/notifications/unsubscribe', wrap((req, res) => {
  if (req.body?.endpoint) push.unsubscribe(req.body.endpoint);
  res.json({ ok: true });
}));

router.post('/notifications/test', wrap(async (req, res) => {
  const sent = await push.sendTo(profileId(req), {
    title: '⚽ Frontrow',
    body: 'Meldingen werken. Je mist geen goal meer.',
    tag: 'frontrow-test',
  });
  res.json({ sent });
}));

// -------------------------------------------------------------------- admin
router.post('/admin/sync', wrap(async (req, res) => {
  const result = await tick({ job: 'manual' });
  res.json({ ok: true, result });
}));

router.get('/admin/log', wrap((req, res) => {
  res.json({ syncs: repo.recentSyncs(50) });
}));

// ---------------------------------------------------------------- fallbacks
router.use((req, res) => res.status(404).json({ error: 'not_found', path: req.path }));

// eslint-disable-next-line no-unused-vars -- express identifies error handlers by arity
router.use((err, req, res, next) => {
  log.error(err);
  res.status(500).json({ error: 'server_error', message: err.message });
});

function safeJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export default router;
