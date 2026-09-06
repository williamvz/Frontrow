// Every SQL statement in Frontrow lives here. Routes and the sync engine call
// functions, never the database directly, so the schema can move without a
// hunt through the codebase — and so each statement is prepared exactly once.

import { getDb } from './database.js';
import { nowIso } from '../util/time.js';
import { normalise, matchKey, hashId } from '../util/text.js';
import COMPETITIONS from './seed/competitions.js';
import TEAMS from './seed/teams.js';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('repo');

// ------------------------------------------------------------------ seeding
export function seed() {
  const db = getDb();

  const upsertComp = db.prepare(`
    INSERT INTO competitions (id, name_nl, name_en, short_name, abbr, country, kind, tier,
                              has_table, accent, espn_slug, sportsdb_id, sort_order, enabled)
    VALUES (@id, @name_nl, @name_en, @short_name, @abbr, @country, @kind, @tier,
            @has_table, @accent, @espn_slug, @sportsdb_id, @sort_order, @enabled)
    ON CONFLICT(id) DO UPDATE SET
      name_nl = excluded.name_nl, name_en = excluded.name_en, short_name = excluded.short_name,
      abbr = excluded.abbr, kind = excluded.kind, tier = excluded.tier,
      has_table = excluded.has_table, accent = excluded.accent,
      espn_slug = excluded.espn_slug, sportsdb_id = excluded.sportsdb_id,
      sort_order = excluded.sort_order`);

  const upsertTeam = db.prepare(`
    INSERT INTO teams (id, name, full_name, short_name, code, city, stadium, founded, country,
                       crest, crest_url, primary_color, secondary_color, is_national, aliases)
    VALUES (@id, @name, @full_name, @short_name, @code, @city, @stadium, @founded, @country,
            @crest, @crest_url, @primary_color, @secondary_color, @is_national, @aliases)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, full_name = excluded.full_name, short_name = excluded.short_name,
      code = excluded.code, city = excluded.city, stadium = excluded.stadium,
      founded = excluded.founded, aliases = excluded.aliases,
      -- a colour the user has edited in the app is never overwritten by a reseed
      primary_color   = COALESCE(teams.primary_color, excluded.primary_color),
      secondary_color = COALESCE(teams.secondary_color, excluded.secondary_color)`);

  db.transaction(() => {
    for (const c of COMPETITIONS) {
      upsertComp.run({
        tier: null, accent: null, espn_slug: null, sportsdb_id: null,
        has_table: 1, enabled: 1, sort_order: 100, country: 'NL', ...c,
      });
    }
    // The add-on's `competitions` option is the source of truth for what is on.
    db.prepare('UPDATE competitions SET enabled = 0').run();
    const on = db.prepare('UPDATE competitions SET enabled = 1 WHERE id = ?');
    for (const id of config.competitions) on.run(id);

    for (const t of TEAMS) {
      upsertTeam.run({
        full_name: null, code: null, city: null, stadium: null, founded: null,
        crest: null, crest_url: null, primary_color: null, secondary_color: null,
        is_national: 0, country: 'NL', ...t,
        aliases: JSON.stringify(t.aliases || [t.name]),
      });
    }
  })();

  ensureDefaultProfile();
  log.info(`seeded ${COMPETITIONS.length} competitions, ${TEAMS.length} teams`);
}

export function ensureDefaultProfile() {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM profiles WHERE is_default = 1').get();
  if (existing) return existing;
  const fav = db.prepare('SELECT id FROM teams WHERE id = ?').get(config.favouriteTeam)?.id
    || 'ajax';
  const profile = {
    id: 'default', name: 'Jij', emoji: '⚽', favourite_team_id: fav,
    locale: config.locale, theme: 'club', reduce_motion: 0, spoiler_free: 0,
    is_default: 1, created_at: nowIso(),
  };
  db.prepare(`INSERT INTO profiles (id, name, emoji, favourite_team_id, locale, theme,
                reduce_motion, spoiler_free, is_default, created_at)
              VALUES (@id, @name, @emoji, @favourite_team_id, @locale, @theme,
                @reduce_motion, @spoiler_free, @is_default, @created_at)`).run(profile);
  // A brand-new install follows its favourite club and the competitions it is
  // configured for; the app is useful before you touch a single setting.
  followTeam('default', fav);
  for (const id of config.competitions) follow('default', 'competition', id);
  return profile;
}

// -------------------------------------------------------------- competitions
export const listCompetitions = ({ enabledOnly = true } = {}) =>
  getDb().prepare(`SELECT * FROM competitions ${enabledOnly ? 'WHERE enabled = 1' : ''}
                   ORDER BY sort_order, short_name`).all();

export const getCompetition = (id) =>
  getDb().prepare('SELECT * FROM competitions WHERE id = ?').get(id);

export function ensureSeason(competitionId, startYear) {
  const db = getDb();
  const id = `${competitionId}:${startYear}-${startYear + 1}`;
  const label = `${startYear}/${String(startYear + 1).slice(2)}`;
  db.prepare(`INSERT INTO seasons (id, competition_id, label, start_year, end_year, is_current)
              VALUES (?, ?, ?, ?, ?, 1)
              ON CONFLICT(id) DO UPDATE SET is_current = 1`)
    .run(id, competitionId, label, startYear, startYear + 1);
  db.prepare('UPDATE seasons SET is_current = 0 WHERE competition_id = ? AND id != ?')
    .run(competitionId, id);
  return id;
}

export const currentSeason = (competitionId) =>
  getDb().prepare('SELECT * FROM seasons WHERE competition_id = ? AND is_current = 1').get(competitionId);

// --------------------------------------------------------------------- teams
export const getTeam = (id) => getDb().prepare('SELECT * FROM teams WHERE id = ?').get(id);
export const listTeams = () => getDb().prepare('SELECT * FROM teams ORDER BY name').all();

/**
 * Resolve a provider's spelling of a team to one of ours, in four steps:
 *   1. the provider id we remembered last time (free, exact);
 *   2. an exact normalised-name or alias hit;
 *   3. a "generic words removed" hit — "FC Utrecht" ≡ "Utrecht";
 *   4. give up and create the team, so a cup tie against an amateur side does
 *      not silently drop the match.
 * Steps 1-3 also *learn*: the provider id is stored, so this is the last time
 * we do string work for that team.
 */
export function resolveTeam({ provider, providerTeamId, name, crestUrl, color }) {
  const db = getDb();
  if (!name && !providerTeamId) return null;

  if (providerTeamId) {
    const hit = db.prepare('SELECT team_id FROM team_providers WHERE provider = ? AND provider_team_id = ?')
      .get(provider, String(providerTeamId));
    if (hit) return hit.team_id;
  }

  const wanted = normalise(name);
  const key = matchKey(name);
  let found = null;

  for (const t of listTeams()) {
    let aliases = [];
    try { aliases = JSON.parse(t.aliases || '[]'); } catch { /* corrupt row, ignore */ }
    const names = [t.name, t.full_name, t.short_name, ...aliases].filter(Boolean);
    if (names.some((n) => normalise(n) === wanted)) { found = t.id; break; }
    if (!found && names.some((n) => matchKey(n) === key)) found = t.id;
  }

  if (!found) {
    found = uniqueTeamId(name);
    db.prepare(`INSERT INTO teams (id, name, short_name, country, crest_url, primary_color, aliases)
                VALUES (?, ?, ?, 'NL', ?, ?, ?)`)
      .run(found, name, name, crestUrl || null, color || null, JSON.stringify([name]));
    log.info(`new team discovered: ${name} (${found})`);
  }

  if (providerTeamId) {
    db.prepare(`INSERT INTO team_providers (team_id, provider, provider_team_id) VALUES (?, ?, ?)
                ON CONFLICT(team_id, provider) DO UPDATE SET provider_team_id = excluded.provider_team_id`)
      .run(found, provider, String(providerTeamId));
  }
  if (crestUrl) {
    db.prepare('UPDATE teams SET crest_url = COALESCE(crest_url, ?) WHERE id = ?').run(crestUrl, found);
  }
  return found;
}

function uniqueTeamId(name) {
  const db = getDb();
  const base = normalise(name).replace(/ /g, '_') || `team_${hashId(name)}`;
  let id = base; let n = 2;
  while (db.prepare('SELECT 1 FROM teams WHERE id = ?').get(id)) id = `${base}_${n++}`;
  return id;
}

// ------------------------------------------------------------------- matches
/** Stable id: a match keeps it across providers, restarts and reschedules. */
export const matchIdFor = (competitionId, homeTeamId, awayTeamId, kickoffIso) =>
  hashId(competitionId, homeTeamId, awayTeamId, String(kickoffIso).slice(0, 10));

export const getMatch = (id) => getDb().prepare('SELECT * FROM matches WHERE id = ?').get(id);

export function findMatch({ provider, providerMatchId, competitionId, homeTeamId, awayTeamId, kickoffIso }) {
  const db = getDb();
  if (providerMatchId) {
    const hit = db.prepare('SELECT * FROM matches WHERE provider = ? AND provider_match_id = ?')
      .get(provider, String(providerMatchId));
    if (hit) return hit;
  }
  // Fall back to the stable id, which also catches a match first seen through
  // a different provider — and a kickoff that moved by a few hours on the day.
  const byId = db.prepare('SELECT * FROM matches WHERE id = ?')
    .get(matchIdFor(competitionId, homeTeamId, awayTeamId, kickoffIso));
  if (byId) return byId;

  return db.prepare(`SELECT * FROM matches
                     WHERE competition_id = ? AND home_team_id = ? AND away_team_id = ?
                       AND ABS(julianday(kickoff_utc) - julianday(?)) < 3`)
    .get(competitionId, homeTeamId, awayTeamId, kickoffIso);
}

const MATCH_FIELDS = [
  'competition_id', 'season_id', 'stage', 'round_label', 'matchday', 'home_team_id', 'away_team_id',
  'kickoff_utc', 'status', 'status_detail', 'minute', 'minute_display', 'home_score', 'away_score',
  'home_score_ht', 'away_score_ht', 'home_pens', 'away_pens', 'winner_team_id', 'venue',
  'attendance', 'referee', 'broadcaster', 'provider', 'provider_match_id', 'has_lineups', 'has_stats',
  'started_at', 'finished_at',
];

export function upsertMatch(row) {
  const db = getDb();
  const existing = getMatch(row.id);
  const now = nowIso();
  if (!existing) {
    db.prepare(`INSERT INTO matches (id, ${MATCH_FIELDS.join(', ')}, created_at, updated_at)
                VALUES (@id, ${MATCH_FIELDS.map((f) => `@${f}`).join(', ')}, @created_at, @updated_at)`)
      .run({ ...blankMatch(), ...row, created_at: now, updated_at: now });
    return { created: true, changed: MATCH_FIELDS.filter((f) => row[f] != null) };
  }
  const changed = MATCH_FIELDS.filter((f) => row[f] !== undefined && row[f] !== existing[f]);
  if (!changed.length) return { created: false, changed: [] };
  db.prepare(`UPDATE matches SET ${changed.map((f) => `${f} = @${f}`).join(', ')}, updated_at = @updated_at
              WHERE id = @id`)
    .run({ ...row, updated_at: now });
  return { created: false, changed };
}

const blankMatch = () => Object.fromEntries(MATCH_FIELDS.map((f) => [f, null]));

/** Insert an event if we have not seen it; returns true when it is new. */
export function addEvent(ev) {
  const db = getDb();
  const id = hashId(ev.match_id, ev.type, ev.minute, ev.minute_extra ?? '', ev.player_name ?? '', ev.team_id ?? '');
  const exists = db.prepare('SELECT 1 FROM match_events WHERE id = ?').get(id);
  if (exists) return false;
  db.prepare(`INSERT INTO match_events (id, match_id, team_id, type, minute, minute_extra,
                minute_display, player_name, player_id, assist_name, related_name,
                home_score, away_score, detail, sort_key, created_at)
              VALUES (@id, @match_id, @team_id, @type, @minute, @minute_extra,
                @minute_display, @player_name, @player_id, @assist_name, @related_name,
                @home_score, @away_score, @detail, @sort_key, @created_at)`)
    .run({
      player_id: null, assist_name: null, related_name: null, detail: null,
      home_score: null, away_score: null, minute_extra: null, minute_display: null,
      ...ev,
      id,
      sort_key: (ev.minute ?? 0) * 100 + (ev.minute_extra ?? 0),
      created_at: nowIso(),
    });
  return true;
}

export const eventsFor = (matchId) =>
  getDb().prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY sort_key, created_at').all(matchId);

export function replaceLineups(matchId, teamId, players, formation, coach) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM lineups WHERE match_id = ? AND team_id = ?').run(matchId, teamId);
    const ins = db.prepare(`INSERT OR REPLACE INTO lineups
      (match_id, team_id, player_name, player_id, shirt, position, formation_x, formation_y,
       is_starter, is_captain, rating)
      VALUES (@match_id, @team_id, @player_name, @player_id, @shirt, @position, @formation_x,
              @formation_y, @is_starter, @is_captain, @rating)`);
    for (const p of players) {
      if (!p.name) continue;
      ins.run({
        match_id: matchId, team_id: teamId, player_name: p.name,
        player_id: p.playerId ?? null, shirt: p.shirt ?? null, position: p.position ?? null,
        formation_x: p.x ?? null, formation_y: p.y ?? null,
        is_starter: p.starter ? 1 : 0, is_captain: p.captain ? 1 : 0, rating: p.rating ?? null,
      });
    }
    db.prepare(`INSERT INTO formations (match_id, team_id, formation, coach) VALUES (?, ?, ?, ?)
                ON CONFLICT(match_id, team_id) DO UPDATE SET formation = excluded.formation, coach = excluded.coach`)
      .run(matchId, teamId, formation ?? null, coach ?? null);
    db.prepare('UPDATE matches SET has_lineups = 1 WHERE id = ?').run(matchId);
  })();
}

export function replaceStats(matchId, rows) {
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM match_stats WHERE match_id = ?').run(matchId);
    const ins = db.prepare('INSERT OR REPLACE INTO match_stats (match_id, team_id, metric, value) VALUES (?, ?, ?, ?)');
    for (const r of rows) ins.run(matchId, r.teamId, r.metric, r.value);
    if (rows.length) db.prepare('UPDATE matches SET has_stats = 1 WHERE id = ?').run(matchId);
  })();
}

// ------------------------------------------------------------------- follows
export const follow = (profileId, kind, targetId, alerts) => {
  getDb().prepare(`INSERT INTO follows (profile_id, kind, target_id, rank, alerts, created_at)
                   VALUES (?, ?, ?, 0, ?, ?)
                   ON CONFLICT(profile_id, kind, target_id) DO UPDATE SET alerts = excluded.alerts`)
    .run(profileId, kind, targetId, JSON.stringify(alerts || {}), nowIso());
};
export const followTeam = (profileId, teamId, alerts) => follow(profileId, 'team', teamId, alerts);
export const unfollow = (profileId, kind, targetId) =>
  getDb().prepare('DELETE FROM follows WHERE profile_id = ? AND kind = ? AND target_id = ?')
    .run(profileId, kind, targetId);
export const listFollows = (profileId) =>
  getDb().prepare('SELECT * FROM follows WHERE profile_id = ? ORDER BY rank, target_id').all(profileId);

// ------------------------------------------------------------------ profiles
export const getProfile = (id) => getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id);
export const listProfiles = () => getDb().prepare('SELECT * FROM profiles ORDER BY is_default DESC, name').all();

// ------------------------------------------------------------------ sync log
export function startSyncLog(job, provider) {
  const info = getDb().prepare('INSERT INTO sync_log (started_at, job, provider) VALUES (?, ?, ?)')
    .run(nowIso(), job, provider || null);
  return info.lastInsertRowid;
}
export function finishSyncLog(id, { ok, seen = 0, changed = 0, events = 0, message = null }) {
  getDb().prepare(`UPDATE sync_log SET finished_at = ?, ok = ?, matches_seen = ?,
                     matches_changed = ?, events_added = ?, message = ? WHERE id = ?`)
    .run(nowIso(), ok ? 1 : 0, seen, changed, events, message, id);
}
export const recentSyncs = (limit = 25) =>
  getDb().prepare('SELECT * FROM sync_log ORDER BY id DESC LIMIT ?').all(limit);
