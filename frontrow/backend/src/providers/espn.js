// ESPN's public site API. No key, no registration, generous enough for a
// household, and it carries the two things the free alternatives do not:
// a live minute and named goal scorers.
//
//   scoreboard  /apis/site/v2/sports/soccer/<slug>/scoreboard?dates=YYYYMMDD
//   summary     /apis/site/v2/sports/soccer/<slug>/summary?event=<id>
//   standings   /apis/v2/sports/soccer/<slug>/standings?season=<year>
//
// Nothing here is contractual — it is an undocumented API — so every read is
// defensive and a shape change degrades to "less data", never to a crash.

import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('espn');

// Two hosts serve the same data.
//
// In August 2026 ESPN put an Akamai bot rule in front of site.api.espn.com
// that answers browser-shaped User-Agents with a 403 while letting tool-shaped
// ones (curl, python-requests, okhttp, Go-http-client) straight through. The
// sibling host site.web.api.espn.com is not behind that rule and additionally
// sends `access-control-allow-origin: *`.
//
// So: ask site.web.api first, fall back to site.api, and send a User-Agent the
// allowlist recognises. Both halves matter — a polite "Frontrow/1.0" string is
// exactly the shape that gets refused, which is how an app like this dies
// quietly six months after it was written.
const HOSTS = ['https://site.web.api.espn.com', 'https://site.api.espn.com'];
const SITE = (host) => `${host}/apis/site/v2/sports/soccer`;
// Standings live on /apis/v2, not /apis/site/v2 — the site path returns an
// empty document rather than an error, which is worse.
const CORE = (host) => `${host}/apis/v2/sports/soccer`;

export const name = 'espn';
export const supports = {
  scores: true, events: true, lineups: true, stats: true, standings: true, schedule: true,
};

const headers = () => ({ 'User-Agent': config.userAgent, Accept: 'application/json' });

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

/**
 * Fetch a path from whichever host answers, with one retry on a transient
 * failure. `path` is host-relative and built by SITE()/CORE().
 */
async function get(buildUrl, { attempts = 2 } = {}) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    for (const host of HOSTS) {
      const url = buildUrl(host);
      try {
        const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(15000) });
        if (res.ok) return await res.json();
        // 403 means this host is refusing us; try the other one immediately.
        // 429/5xx are transient and worth a backoff.
        lastError = new Error(`ESPN ${res.status} ${res.statusText} for ${url}`);
        if (res.status === 403 || res.status === 404) continue;
        if (res.status === 429 || res.status >= 500) break;
        return null;
      } catch (err) {
        lastError = err;
      }
    }
    if (attempt < attempts - 1) await sleep(1200 * (attempt + 1));
  }
  throw lastError || new Error('ESPN: no host answered');
}

const STATE_TO_STATUS = { pre: 'scheduled', in: 'live', post: 'finished' };

// ESPN's status names are stable enough to map explicitly; anything unknown
// falls back to the coarse pre/in/post state.
const DETAIL_TO_STATUS = {
  STATUS_SCHEDULED: 'scheduled',
  STATUS_IN_PROGRESS: 'live',
  STATUS_FIRST_HALF: 'live',
  STATUS_SECOND_HALF: 'live',
  STATUS_HALFTIME: 'halftime',
  STATUS_END_OF_EXTRATIME: 'live',
  STATUS_OVERTIME: 'live',
  STATUS_SHOOTOUT: 'live',
  STATUS_FINAL: 'finished',
  STATUS_FULL_TIME: 'finished',
  STATUS_POSTPONED: 'postponed',
  STATUS_CANCELED: 'cancelled',
  STATUS_ABANDONED: 'abandoned',
  STATUS_FORFEIT: 'cancelled',
};

/** "45+2'" -> { minute: 45, extra: 2 }; "67'" -> { minute: 67, extra: null } */
function parseClock(display) {
  if (!display) return { minute: null, extra: null };
  const m = String(display).match(/(\d+)(?:\s*\+\s*(\d+))?/);
  if (!m) return { minute: null, extra: null };
  return { minute: Number(m[1]), extra: m[2] ? Number(m[2]) : null };
}

const GOAL_TYPES = /goal/i;
const OWN_GOAL = /own goal/i;
const PENALTY = /penalty/i;
const MISSED = /missed|saved/i;
const YELLOW = /yellow/i;
const RED = /red card|sent off/i;
const SECOND_YELLOW = /second yellow|two yellow/i;
const SUB = /substitution/i;

function classifyEvent(detail) {
  const text = `${detail?.type?.text || ''} ${detail?.type?.abbreviation || ''}`;
  if (SUB.test(text)) return 'substitution';
  if (SECOND_YELLOW.test(text)) return 'second_yellow';
  if (RED.test(text)) return 'red';
  if (YELLOW.test(text)) return 'yellow';
  if (detail?.penaltyKick && MISSED.test(text)) return 'penalty_missed';
  if (detail?.ownGoal || OWN_GOAL.test(text)) return 'own_goal';
  if (detail?.scoringPlay || GOAL_TYPES.test(text)) {
    return detail?.penaltyKick || PENALTY.test(text) ? 'penalty' : 'goal';
  }
  return null;
}

function mapEvents(competition, homeTeamId) {
  const out = [];
  for (const d of competition?.details || []) {
    // Shootout kicks are not goals in the 90 minutes; they are recorded on the
    // match as home_pens/away_pens instead so the timeline stays honest.
    if (/shootout/i.test(d?.type?.text || '')) continue;
    const type = classifyEvent(d);
    if (!type) continue;
    const { minute, extra } = parseClock(d?.clock?.displayValue);
    const athletes = d?.athletesInvolved || [];
    out.push({
      type,
      side: String(d?.team?.id) === String(homeTeamId) ? 'home' : 'away',
      minute,
      minuteExtra: extra,
      minuteDisplay: d?.clock?.displayValue || null,
      player: athletes[0]?.displayName || null,
      assist: type === 'goal' && athletes[1] ? athletes[1].displayName : null,
      related: type === 'substitution' ? athletes[1]?.displayName || null : null,
      homeScore: Number.isFinite(d?.scoreValue) && d?.homeScore != null ? Number(d.homeScore) : null,
      awayScore: d?.awayScore != null ? Number(d.awayScore) : null,
      detail: d?.type?.text || null,
    });
  }
  return out;
}

function mapEvent(ev, competitionId) {
  const comp = ev?.competitions?.[0];
  if (!comp) return null;
  const competitors = comp.competitors || [];
  const home = competitors.find((c) => c.homeAway === 'home');
  const away = competitors.find((c) => c.homeAway === 'away');
  if (!home || !away) return null;

  const statusObj = ev.status || comp.status || {};
  const status = DETAIL_TO_STATUS[statusObj?.type?.name]
    || STATE_TO_STATUS[statusObj?.type?.state]
    || 'scheduled';

  const { minute, extra } = parseClock(statusObj?.displayClock);
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

  return {
    providerId: String(ev.id),
    competitionId,
    homeName: home.team?.displayName || home.team?.name || home.team?.shortDisplayName,
    awayName: away.team?.displayName || away.team?.name || away.team?.shortDisplayName,
    homeProviderId: home.team?.id ? String(home.team.id) : null,
    awayProviderId: away.team?.id ? String(away.team.id) : null,
    homeCrestUrl: home.team?.logo || home.team?.logos?.[0]?.href || null,
    awayCrestUrl: away.team?.logo || away.team?.logos?.[0]?.href || null,
    kickoffIso: ev.date ? new Date(ev.date).toISOString() : null,
    status,
    statusDetail: statusObj?.type?.shortDetail || statusObj?.type?.detail || null,
    minute: status === 'live' ? minute : null,
    minuteDisplay: status === 'live' ? statusObj?.displayClock || null : null,
    homeScore: num(home.score),
    awayScore: num(away.score),
    homePens: num(home.shootoutScore),
    awayPens: num(away.shootoutScore),
    // Only meaningful for a knockout tie decided after a level 90 minutes.
    winnerSide: home.winner === true ? 'home' : away.winner === true ? 'away' : null,
    venue: comp.venue?.fullName || null,
    attendance: comp.attendance || null,
    referee: (comp.officials || []).find((o) => /referee/i.test(o?.position?.displayName || ''))?.displayName || null,
    round: ev.season?.slug || comp.notes?.[0]?.headline || null,
    matchday: null,
    stage: 'league',
    events: mapEvents(comp, home.team?.id),
  };
}

/**
 * All matches for a competition between two dates (inclusive, 'YYYY-MM-DD').
 * ESPN accepts a compact range, which keeps a whole week to a single request.
 */
export async function fetchMatches({ competition, from, to }) {
  if (!competition?.espn_slug) return [];
  const dates = from === to
    ? from.replaceAll('-', '')
    : `${from.replaceAll('-', '')}-${to.replaceAll('-', '')}`;
  // Without an explicit limit the scoreboard silently caps at 100 events,
  // which a full European matchday can exceed.
  const data = await get((h) => `${SITE(h)}/${competition.espn_slug}/scoreboard?dates=${dates}&limit=500`);
  if (!data) return [];
  const out = [];
  for (const ev of data.events || []) {
    const m = mapEvent(ev, competition.id);
    if (m && m.kickoffIso) out.push(m);
  }
  log.debug(`${competition.id}: ${out.length} matches for ${dates}`);
  return out;
}

/** Lineups, formations, team stats and the full event list for one match. */
export async function fetchDetail({ competition, providerMatchId }) {
  if (!competition?.espn_slug || !providerMatchId) return null;
  // The summary document is ~30x the size of a scoreboard entry, which is why
  // the scheduler only asks for a handful of them per tick.
  const data = await get((h) => `${SITE(h)}/${competition.espn_slug}/summary?event=${providerMatchId}`);
  if (!data) return null;

  const header = data.header?.competitions?.[0];
  const competitors = header?.competitors || [];
  const homeId = competitors.find((c) => c.homeAway === 'home')?.team?.id;
  const sideOf = (teamId) => (String(teamId) === String(homeId) ? 'home' : 'away');

  const lineups = [];
  for (const entry of data.rosters || []) {
    const players = [];
    for (const p of entry.roster || []) {
      players.push({
        name: p.athlete?.displayName || p.athlete?.fullName,
        playerId: p.athlete?.id ? String(p.athlete.id) : null,
        shirt: p.jersey ? Number(p.jersey) : null,
        position: p.position?.abbreviation || p.athlete?.position?.abbreviation || null,
        starter: p.starter === true,
        captain: p.captain === true,
        x: p.formationPlace ? null : null,
        rating: p.stats?.find?.((s) => /rating/i.test(s.name || ''))?.value ?? null,
      });
    }
    lineups.push({
      side: sideOf(entry.team?.id),
      formation: entry.formation || null,
      coach: entry.coach?.[0]?.displayName || null,
      players: players.filter((p) => p.name),
    });
  }

  const stats = [];
  for (const t of data.boxscore?.teams || []) {
    const side = sideOf(t.team?.id);
    for (const s of t.statistics || []) {
      const value = Number(String(s.displayValue ?? s.value ?? '').replace('%', ''));
      if (Number.isFinite(value) && s.name) stats.push({ side, metric: s.name, value });
    }
  }

  const events = header ? mapEvents(header, homeId) : [];

  return { events, lineups, stats };
}

/** The league table, straight from ESPN, used when we cannot compute one. */
export async function fetchStandings({ competition, season }) {
  if (!competition?.espn_slug) return null;
  const data = await get((h) => `${CORE(h)}/${competition.espn_slug}/standings?season=${season}`);
  if (!data) return null;

  const groups = data.children?.length ? data.children : [data];
  const rows = [];
  for (const g of groups) {
    const groupKey = data.children?.length ? (g.name || g.abbreviation || '') : '';
    for (const entry of g.standings?.entries || []) {
      const stat = (n) => entry.stats?.find((s) => s.name === n)?.value;
      rows.push({
        teamName: entry.team?.displayName || entry.team?.name,
        providerTeamId: entry.team?.id ? String(entry.team.id) : null,
        groupKey,
        position: Number(stat('rank') ?? rows.length + 1),
        played: Number(stat('gamesPlayed') ?? 0),
        won: Number(stat('wins') ?? 0),
        drawn: Number(stat('ties') ?? 0),
        lost: Number(stat('losses') ?? 0),
        goalsFor: Number(stat('pointsFor') ?? 0),
        goalsAgainst: Number(stat('pointsAgainst') ?? 0),
        points: Number(stat('points') ?? 0),
        form: entry.stats?.find((s) => s.name === 'form')?.displayValue || null,
      });
    }
  }
  return rows;
}

/** Crests and provider ids for every team in a competition. */
export async function fetchTeams({ competition }) {
  if (!competition?.espn_slug) return [];
  const data = await get((h) => `${SITE(h)}/${competition.espn_slug}/teams`);
  if (!data) return [];
  const entries = data.sports?.[0]?.leagues?.[0]?.teams || [];
  return entries.map(({ team }) => ({
    providerTeamId: String(team.id),
    name: team.displayName,
    shortName: team.shortDisplayName,
    abbreviation: team.abbreviation,
    color: team.color ? `#${team.color}` : null,
    alternateColor: team.alternateColor ? `#${team.alternateColor}` : null,
    crestUrl: team.logos?.[0]?.href || null,
  }));
}
