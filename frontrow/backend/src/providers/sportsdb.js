// TheSportsDB — the keyless safety net.
//
// It has no live minute and no goal scorers, so it can never be primary. What
// it is for is the day ESPN changes shape: fixtures keep appearing and final
// results still land.
//
// Honesty about its limits: since 2025 TheSportsDB has been moving the season
// endpoints behind its Patreon tiers, and the public test key now gets 401 or
// 403 on some of them. So this provider *disables itself* the moment it is told
// it is not welcome, rather than retrying every twenty seconds forever, and it
// says so once in the log. Set THESPORTSDB_KEY to a paid key to re-enable it,
// or set `football_data_token` in the add-on options for a fallback that is
// still free and still covers the Eredivisie.

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

// Set once we have been refused; cleared only by a restart.
let disabled = null;

async function get(url) {
  if (disabled) throw new Error(disabled);
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (res.status === 401 || res.status === 403) {
    disabled = `TheSportsDB weigert de gratis sleutel (${res.status}) — deze bron wordt overgeslagen`;
    log.warn(disabled);
    throw new Error(disabled);
  }
  if (!res.ok) throw new Error(`TheSportsDB ${res.status} for ${url}`);
  return res.json();
}

export const isDisabled = () => Boolean(disabled);

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
