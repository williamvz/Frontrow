// Deciding what is worth interrupting someone for.
//
// The rule Frontrow follows: a notification is only ever sent for something
// the profile explicitly follows, and each event is sent at most once, ever —
// enforced by a row in notifications_sent rather than by in-memory state, so a
// restart in the 89th minute does not replay the whole match to your phone.

import { getDb } from '../db/database.js';
import * as repo from '../db/repo.js';
import * as push from './push.js';
import * as ha from './ha.js';
import { bus } from '../realtime/hub.js';
import { hashId } from '../util/text.js';
import { nowIso } from '../util/time.js';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('notify');

const DEFAULT_ALERTS = {
  kickoff: true, goal: true, halftime: false, fulltime: true,
  red_card: false, lineups: false,
};

/** Everyone who follows either team, or the competition, with alerts enabled. */
function audienceFor({ competitionId, teamIds }, alertKey) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT DISTINCT f.profile_id, f.alerts, f.kind, f.target_id
    FROM follows f
    WHERE (f.kind = 'team' AND f.target_id IN (${teamIds.map(() => '?').join(',')}))
       OR (f.kind = 'competition' AND f.target_id = ?)`)
    .all(...teamIds, competitionId);

  const out = new Map();
  for (const r of rows) {
    let alerts = DEFAULT_ALERTS;
    try { alerts = { ...DEFAULT_ALERTS, ...JSON.parse(r.alerts || '{}') }; } catch { /* keep defaults */ }
    // A team follow is a stronger signal than a competition follow: following
    // the Eredivisie should not buzz your phone for all nine games at once, so
    // competition follows only carry the quieter alerts.
    const allowed = r.kind === 'team' ? alerts[alertKey] : (alertKey === 'goal' ? false : alerts[alertKey]);
    if (allowed) out.set(r.profile_id, alerts);
  }
  return [...out.keys()];
}

/** Send once, ever. Returns false if this exact thing was already sent. */
function once(key, fn) {
  const db = getDb();
  const id = hashId(key);
  const seen = db.prepare('SELECT 1 FROM notifications_sent WHERE key = ?').get(id);
  if (seen) return false;
  db.prepare('INSERT INTO notifications_sent (key, created_at) VALUES (?, ?)').run(id, nowIso());
  fn();
  return true;
}

const teamName = (id) => repo.getTeam(id)?.name || 'onbekend';

async function onGoal(goal) {
  const home = repo.getTeam(goal.homeTeamId);
  const away = repo.getTeam(goal.awayTeamId);
  const scoring = repo.getTeam(goal.scoringTeamId);
  if (!home || !away || !scoring) return;

  const line = `${home.short_name} ${goal.homeScore}-${goal.awayScore} ${away.short_name}`;
  const who = goal.player
    ? `${goal.player}${goal.kind === 'penalty' ? ' (pen.)' : goal.kind === 'own_goal' ? ' (e.d.)' : ''}`
    : null;
  const body = who ? `${who} · ${goal.minuteDisplay || `${goal.minute}'`}` : `${goal.minuteDisplay || `${goal.minute}'`}`;

  // --- Home Assistant: fire once per goal, for the house.
  const favTeamId = repo.getProfile('default')?.favourite_team_id;
  once(`ha:goal:${goal.matchId}:${goal.minute}:${goal.player || ''}:${goal.homeScore}-${goal.awayScore}`, () => {
    ha.announceGoal({
      ...goal,
      teamName: scoring.name,
      againstName: teamName(goal.againstTeamId),
      homeName: home.name, awayName: away.name,
      color: scoring.primary_color, secondaryColor: scoring.secondary_color,
      isFavourite: scoring.id === favTeamId,
    });
  });

  // --- phones
  if (!config.goalNotifications) return;
  const profiles = audienceFor(
    { competitionId: goal.competitionId, teamIds: [goal.homeTeamId, goal.awayTeamId] }, 'goal',
  );
  for (const profileId of profiles) {
    once(`push:goal:${profileId}:${goal.matchId}:${goal.minute}:${goal.player || ''}:${goal.homeScore}-${goal.awayScore}`, () => {
      push.sendTo(profileId, {
        title: `⚽ ${line}`,
        body,
        tag: `match-${goal.matchId}`,
        renotify: true,
        data: { url: `#/match/${goal.matchId}`, matchId: goal.matchId },
        color: scoring.primary_color,
      }).catch(() => {});
    });
  }
}

async function onStatus(change) {
  const home = repo.getTeam(change.homeTeamId);
  const away = repo.getTeam(change.awayTeamId);
  if (!home || !away) return;

  const map = {
    live: { key: 'kickoff', title: '🟢 Afgetrapt', body: `${home.short_name} – ${away.short_name}` },
    halftime: { key: 'halftime', title: '⏸️ Rust', body: `${home.short_name} ${change.homeScore}-${change.awayScore} ${away.short_name}` },
    finished: { key: 'fulltime', title: '⏱️ Eindstand', body: `${home.short_name} ${change.homeScore}-${change.awayScore} ${away.short_name}` },
  };
  const n = map[change.to];
  if (!n) return;

  const profiles = audienceFor(
    { competitionId: change.competitionId, teamIds: [change.homeTeamId, change.awayTeamId] }, n.key,
  );
  for (const profileId of profiles) {
    once(`push:${n.key}:${profileId}:${change.matchId}`, () => {
      push.sendTo(profileId, {
        title: n.title, body: n.body, tag: `match-${change.matchId}`,
        data: { url: `#/match/${change.matchId}`, matchId: change.matchId },
      }).catch(() => {});
    });
  }

  if (change.to === 'live' || change.to === 'finished') {
    ha.fireEvent('frontrow_match_status', {
      match_id: change.matchId, status: change.to,
      home_team: home.name, away_team: away.name,
      score: `${change.homeScore ?? 0}-${change.awayScore ?? 0}`,
      competition: change.competitionId,
    });
  }

  if (change.to === 'finished' && config.haNotifyService) {
    ha.callService(config.haNotifyService, {
      title: 'Frontrow',
      message: `${n.title}: ${home.name} ${change.homeScore}-${change.awayScore} ${away.name}`,
    });
  }
}

export function start() {
  push.init();
  bus.on('match:goal', (g) => { onGoal(g).catch((e) => log.debug(e.message)); });
  bus.on('match:status', (s) => { onStatus(s).catch((e) => log.debug(e.message)); });
  log.info(`notifications active (${push.deviceCount()} devices, HA ${ha.isAvailable() ? 'connected' : 'unavailable'})`);
}
