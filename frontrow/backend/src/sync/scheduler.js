// Adaptive polling.
//
// The naive approach — poll everything every minute — is 1,440 requests a day
// to a free API to learn nothing on a Tuesday in July. Instead the scheduler
// looks at what is actually happening and picks its own next wake-up:
//
//   a match is live or kicks off within 15 min  -> every 45s
//   a match kicks off later today               -> every 5 min
//   nothing today                               -> every 30 min
//
// Plus a daily calendar sweep at 05:30 Dutch time to pick up rescheduled
// fixtures, and a catch-up on boot for everything missed while the Pi was off.

import cron from 'node-cron';
import { getDb } from '../db/database.js';
import * as repo from '../db/repo.js';
import { syncCompetition, syncMatchDetail, defaultWindow } from './engine.js';
import { refreshStandings } from './standings.js';
import { publish } from '../realtime/hub.js';
import { localDate, addDays, minutesUntil } from '../util/time.js';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('scheduler');

let timer = null;
let cronJobs = [];
let running = false;
let lastTickAt = null;
let currentIntervalMs = null;

/** How urgent is right now? Drives both the cadence and the UI's "live" badge. */
export function urgency() {
  const db = getDb();
  const live = db.prepare(`
    SELECT COUNT(*) AS n FROM matches
    WHERE status IN ('live', 'halftime')`).get().n;

  if (live > 0) {
    // A match involving a team someone in the house follows gets the fast
    // lane. Everything else live is still worth watching, just not every
    // twenty seconds.
    const hot = db.prepare(`
      SELECT COUNT(*) AS n FROM matches m
      WHERE m.status IN ('live', 'halftime')
        AND EXISTS (SELECT 1 FROM follows f WHERE f.kind = 'team'
                     AND f.target_id IN (m.home_team_id, m.away_team_id))`).get().n;
    return { level: hot > 0 ? 'hot' : 'live', live, hot };
  }

  const soon = db.prepare(`
    SELECT MIN(kickoff_utc) AS next FROM matches
    WHERE status = 'scheduled' AND kickoff_utc > datetime('now', '-10 minutes')`).get().next;

  if (soon) {
    const mins = minutesUntil(soon);
    if (mins <= config.poll.preKickoffMinutes) return { level: 'hot', live: 0, next: soon };
    if (localDate(soon) === localDate()) return { level: 'soon', live: 0, next: soon };
  }

  // A match that should have finished by now but has not gone final keeps us
  // awake: providers are often a few minutes late with the full-time whistle.
  const stale = db.prepare(`
    SELECT COUNT(*) AS n FROM matches
    WHERE status NOT IN ('finished','postponed','cancelled','abandoned')
      AND kickoff_utc < datetime('now', '-100 minutes')
      AND kickoff_utc > datetime('now', '-1 day')`).get().n;
  if (stale > 0) return { level: 'soon', live: 0, stale };

  return { level: 'idle', live: 0, next: soon || null };
}

function intervalFor(level) {
  const s = level === 'hot' ? config.poll.hotSeconds
    : level === 'live' ? config.poll.liveSeconds
      : level === 'soon' ? config.poll.soonSeconds
        : config.poll.idleSeconds;
  return s * 1000;
}

/**
 * During a live tick there is no point asking about the KNVB Beker in
 * September. Narrow to competitions that have a match in play or about to
 * start; a wider sweep still happens daily and on boot.
 */
function competitionsInPlay() {
  const db = getDb();
  const ids = db.prepare(`
    SELECT DISTINCT competition_id FROM matches
    WHERE (status IN ('live','halftime'))
       OR (status = 'scheduled'
           AND kickoff_utc BETWEEN datetime('now','-10 minutes') AND datetime('now','+30 minutes'))
       OR (status NOT IN ('finished','postponed','cancelled','abandoned')
           AND kickoff_utc BETWEEN datetime('now','-4 hours') AND datetime('now'))`)
    .all().map((r) => r.competition_id);
  const all = repo.listCompetitions();
  return ids.length ? all.filter((c) => ids.includes(c.id)) : all;
}

/** One pass over every enabled competition. */
export async function tick({ job = 'live', window } = {}) {
  if (running) { log.debug('tick skipped — previous run still going'); return null; }
  running = true;
  const started = Date.now();
  const totals = { seen: 0, changed: 0, events: 0 };

  try {
    const w = window || tightWindow();
    const competitions = job === 'live' ? competitionsInPlay() : repo.listCompetitions();
    for (const competition of competitions) {
      const r = await syncCompetition(competition, { ...w, job });
      totals.seen += r.seen; totals.changed += r.changed; totals.events += r.events;

      if (r.changed) {
        const season = repo.currentSeason(competition.id);
        if (season && competition.has_table) refreshStandings(season.id, competition.id);
      }
    }

    // Lineups appear about an hour before kickoff and are the single most
    // requested thing on a match page, so fetch them once, not on every tick.
    await hydrateDetails();

    lastTickAt = new Date().toISOString();
    publish('sync', { ...totals, at: lastTickAt, ms: Date.now() - started });
    return totals;
  } finally {
    running = false;
    schedule();
  }
}

/** Live ticks only look at today and tomorrow; the daily sweep does the rest. */
function tightWindow() {
  const today = localDate();
  return { from: addDays(today, -1), to: addDays(today, 1) };
}

/**
 * Fill in lineups/stats for matches that are about to start, are in progress,
 * or have just finished — at most a handful per tick so a provider is never
 * hammered.
 */
async function hydrateDetails(limit = 4) {
  const db = getDb();
  const candidates = db.prepare(`
    SELECT id, has_lineups, has_stats, status FROM matches
    WHERE kickoff_utc BETWEEN datetime('now', '-4 hours') AND datetime('now', '+90 minutes')
      AND (has_lineups = 0 OR (status = 'finished' AND has_stats = 0))
    ORDER BY kickoff_utc
    LIMIT ?`).all(limit);
  for (const m of candidates) {
    try { await syncMatchDetail(m.id); } catch { /* best effort, never fatal */ }
  }
}

function schedule() {
  clearTimeout(timer);
  const u = urgency();
  const ms = intervalFor(u.level);
  currentIntervalMs = ms;
  const job = ['hot', 'live'].includes(u.level) ? 'live' : 'idle';
  timer = setTimeout(() => { tick({ job }); }, ms);
  if (timer.unref) timer.unref();
  log.debug(`next sync in ${Math.round(ms / 1000)}s (${u.level})`);
}

export function start() {
  log.info(`sync starting — competitions: ${repo.listCompetitions().map((c) => c.id).join(', ')}`);

  // Boot catch-up: a wide window, so a Pi that was off all weekend fills in.
  tick({ job: 'boot', window: defaultWindow() });

  cronJobs.push(cron.schedule('30 5 * * *', () => {
    log.info('daily calendar sweep');
    tick({ job: 'daily', window: defaultWindow() });
  }, { timezone: config.timezone }));

  return { stop };
}

export function stop() {
  clearTimeout(timer);
  for (const j of cronJobs) j.stop?.();
  cronJobs = [];
}

export const status = () => ({
  running,
  lastTickAt,
  intervalSeconds: currentIntervalMs ? Math.round(currentIntervalMs / 1000) : null,
  urgency: urgency(),
  recent: repo.recentSyncs(10),
});
