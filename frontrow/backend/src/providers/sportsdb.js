// TheSportsDB — the safety net. The free tier has no live minute and no goal
// scorers, so it can never be primary, but it does have the full season
// calendar and final scores, which is exactly what you want when ESPN changes
// shape or has an outage: fixtures keep appearing and results still land.

import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('sportsdb');
const KEY = process.env.THESPORTSDB_KEY || '3';   // '3' is the public test key
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

export const name = 'sportsdb';
export const supports = {
  scores: true, events: false, lineups: false, stats: false, standings: true, schedule: true,
};

const HEADERS = { 'User-Agent': config.userAgent, Accept: 'application/json' };

async function get(url) {
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} for ${url}`);
  return res.json();
}

function mapStatus(raw, hasScore) {
  const s = String(raw || '').toLowerCase().trim();
  if (['ft', 'aet', 'pen', 'match finished', 'finished'].includes(s)) return 'finished';
  if (['post.', 'postponed', 'uitgesteld'].some((x) => s.includes(x))) return 'postponed';
  if (['canc.', 'cancelled', 'canceled'].some((x) => s.includes(x))) return 'cancelled';
  if (['abandoned', 'aband.'].some((x) => s.includes(x))) return 'abandoned';
  if (s === 'ht' || s.includes('half time')) return 'halftime';
  if (['1h', '2h', 'et', 'live', 'in progress'].some((x) => s.includes(x))) return 'live';
  // Older rows carry no status at all but do have a score.
  return hasScore ? 'finished' : 'scheduled';
}

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

function mapEvent(ev, competitionId) {
  const hasScore = ev.intHomeScore != null && ev.intHomeScore !== '';
  let kickoffIso = null;
  if (ev.strTimestamp) kickoffIso = new Date(`${ev.strTimestamp.replace(' ', 'T')}Z`).toISOString();
  else if (ev.dateEvent) kickoffIso = new Date(`${ev.dateEvent}T${ev.strTime || '19:00:00'}Z`).toISOString();
  if (!kickoffIso) return null;

  return {
    providerId: String(ev.idEvent),
    competitionId,
    homeName: ev.strHomeTeam,
    awayName: ev.strAwayTeam,
    homeProviderId: ev.idHomeTeam ? String(ev.idHomeTeam) : null,
    awayProviderId: ev.idAwayTeam ? String(ev.idAwayTeam) : null,
    kickoffIso,
    status: mapStatus(ev.strStatus, hasScore),
    statusDetail: ev.strStatus || null,
    minute: null, minuteDisplay: null,
    homeScore: hasScore ? Number(ev.intHomeScore) : null,
    awayScore: num(ev.intAwayScore),
    homeScoreHt: null, awayScoreHt: null,
    homePens: null, awayPens: null, winnerSide: null,
    venue: ev.strVenue || null,
    attendance: num(ev.intSpectators),
    referee: null,
    round: ev.intRound ? `Speelronde ${ev.intRound}` : null,
    matchday: num(ev.intRound),
    stage: 'league',
    events: [],   // the free tier has no reliable per-goal data
  };
}

/** TheSportsDB is season-shaped, not date-shaped; we fetch and filter. */
export async function fetchMatches({ competition, from, to, season }) {
  if (!competition?.sportsdb_id) return [];
  const seasonLabel = season || seasonLabelFromDate(from);
  const data = await get(`${BASE}/eventsseason.php?id=${competition.sportsdb_id}&s=${seasonLabel}`);
  const out = [];
  for (const ev of data.events || []) {
    const m = mapEvent(ev, competition.id);
    if (!m) continue;
    const day = m.kickoffIso.slice(0, 10);
    if (day >= from && day <= to) out.push(m);
  }
  log.debug(`${competition.id}: ${out.length} matches in ${from}..${to}`);
  return out;
}

function seasonLabelFromDate(dateStr) {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(5, 7));
  const start = m >= 7 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export async function fetchDetail() { return null; }

export async function fetchStandings({ competition, season }) {
  if (!competition?.sportsdb_id) return null;
  const label = `${season}-${Number(season) + 1}`;
  const data = await get(`${BASE}/lookuptable.php?l=${competition.sportsdb_id}&s=${label}`);
  return (data.table || []).map((row, i) => ({
    teamName: row.strTeam,
    providerTeamId: row.idTeam ? String(row.idTeam) : null,
    groupKey: '',
    position: Number(row.intRank ?? i + 1),
    played: Number(row.intPlayed ?? 0),
    won: Number(row.intWin ?? 0),
    drawn: Number(row.intDraw ?? 0),
    lost: Number(row.intLoss ?? 0),
    goalsFor: Number(row.intGoalsFor ?? 0),
    goalsAgainst: Number(row.intGoalsAgainst ?? 0),
    points: Number(row.intPoints ?? 0),
    form: null,
  }));
}
