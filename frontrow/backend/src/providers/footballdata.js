// football-data.org — the fallback that is worth a free registration.
//
// It is off unless a token is configured, because Frontrow's promise is that it
// works the second you start it. But when ESPN changes shape — and one day it
// will — this is the difference between "the app is empty" and "the app has
// the fixtures and the final scores, just not the live minute".
//
// The free tier covers the Eredivisie (competition code DED). It does NOT
// include goal scorers, lineups, or a live clock, and its scores are delayed:
// so this provider truthfully reports what it has and nothing more. It never
// claims a match is live.
//
// Get a token at https://www.football-data.org/client/register — it is free
// and takes a minute.

import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('football-data');
const BASE = 'https://api.football-data.org/v4';

export const name = 'footballdata';
export const supports = {
  scores: true, events: false, lineups: false, stats: false, standings: true, schedule: true,
};

// Frontrow competition id -> football-data.org competition code.
const CODES = {
  eredivisie: 'DED',
  ucl: 'CL',
  oranje: null,      // national-team fixtures are not in the free set
  kkd: null,
  knvb_beker: null,
  johan_cruijff_schaal: null,
};

export const isConfigured = () => Boolean(config.footballDataToken);

async function get(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Auth-Token': config.footballDataToken, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 429) throw new Error('football-data: rate limited (10 req/min on the free tier)');
  if (!res.ok) throw new Error(`football-data ${res.status} for ${path}`);
  return res.json();
}

// football-data's own vocabulary, mapped onto ours. Note that TIMED and
// SCHEDULED both mean "not started"; there is no live clock on the free tier,
// so IN_PLAY is reported as live but always without a minute.
const STATUS = {
  SCHEDULED: 'scheduled', TIMED: 'scheduled', IN_PLAY: 'live', PAUSED: 'halftime',
  FINISHED: 'finished', POSTPONED: 'postponed', SUSPENDED: 'postponed',
  CANCELLED: 'cancelled', AWARDED: 'finished',
};

export async function fetchMatches({ competition, from, to }) {
  if (!isConfigured()) return [];
  const code = CODES[competition.id];
  if (!code) return [];

  const data = await get(`/competitions/${code}/matches?dateFrom=${from}&dateTo=${to}`);
  const out = [];
  for (const m of data.matches || []) {
    const full = m.score?.fullTime || {};
    const half = m.score?.halfTime || {};
    out.push({
      providerId: String(m.id),
      competitionId: competition.id,
      homeName: m.homeTeam?.shortName || m.homeTeam?.name,
      awayName: m.awayTeam?.shortName || m.awayTeam?.name,
      homeProviderId: m.homeTeam?.id ? String(m.homeTeam.id) : null,
      awayProviderId: m.awayTeam?.id ? String(m.awayTeam.id) : null,
      homeCrestUrl: m.homeTeam?.crest || null,
      awayCrestUrl: m.awayTeam?.crest || null,
      kickoffIso: m.utcDate ? new Date(m.utcDate).toISOString() : null,
      status: STATUS[m.status] || 'scheduled',
      statusDetail: m.status || null,
      minute: null,          // the free tier has no clock, and we do not invent one
      minuteDisplay: null,
      homeScore: full.home ?? null,
      awayScore: full.away ?? null,
      homeScoreHt: half.home ?? null,
      awayScoreHt: half.away ?? null,
      homePens: m.score?.penalties?.home ?? null,
      awayPens: m.score?.penalties?.away ?? null,
      winnerSide: m.score?.winner === 'HOME_TEAM' ? 'home'
        : m.score?.winner === 'AWAY_TEAM' ? 'away' : null,
      venue: m.venue || null,
      attendance: m.attendance || null,
      referee: m.referees?.[0]?.name || null,
      round: m.matchday ? `Speelronde ${m.matchday}` : null,
      matchday: m.matchday ?? null,
      stage: 'league',
      events: [],            // not available below the paid Deep Data tier
    });
  }
  log.debug(`${competition.id}: ${out.length} matches in ${from}..${to}`);
  return out;
}

export async function fetchDetail() { return null; }

export async function fetchStandings({ competition }) {
  if (!isConfigured()) return null;
  const code = CODES[competition.id];
  if (!code) return null;
  const data = await get(`/competitions/${code}/standings`);
  const table = (data.standings || []).find((s) => s.type === 'TOTAL');
  return (table?.table || []).map((row) => ({
    teamName: row.team?.shortName || row.team?.name,
    providerTeamId: row.team?.id ? String(row.team.id) : null,
    groupKey: '',
    position: row.position,
    played: row.playedGames ?? 0,
    won: row.won ?? 0,
    drawn: row.draw ?? 0,
    lost: row.lost ?? 0,
    goalsFor: row.goalsFor ?? 0,
    goalsAgainst: row.goalsAgainst ?? 0,
    points: row.points ?? 0,
    form: row.form ? row.form.replace(/,/g, '') : null,
  }));
}
