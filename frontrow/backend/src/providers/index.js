// ---------------------------------------------------------------------------
// The provider contract.
//
// Providers are the only part of Frontrow that knows what a third party's JSON
// looks like. Everything downstream — the sync engine, the database, the API,
// the app — speaks the canonical shapes below and nothing else. That is what
// makes swapping or adding a provider a one-file change, and it is why the
// offline `replay` provider can drive the entire system in tests.
//
// A provider exports:
//   name            unique string, also the key in team_providers
//   supports        { scores, events, lineups, stats, standings, schedule }
//   fetchMatches({ competition, from, to })  -> ProviderMatch[]
//   fetchDetail({ competition, providerMatchId }) -> ProviderDetail | null
//   fetchStandings({ competition, season })  -> ProviderStanding[] | null
//
// Every method may throw; the sync engine catches, logs and falls through to
// the next provider. A provider must never write to the database.
//
// ---------------------------------------------------------------------------
// @typedef ProviderMatch
//   providerId        string   the provider's own match id
//   competitionId     string   Frontrow competition id ('eredivisie')
//   homeName          string   as spelled by the provider
//   awayName          string
//   homeProviderId    string?  provider's team id, remembered for next time
//   awayProviderId    string?
//   kickoffIso        string   ISO 8601, UTC
//   status            'scheduled'|'live'|'halftime'|'finished'|'postponed'|
//                     'cancelled'|'abandoned'
//   statusDetail      string?  'FT' | 'AET' | 'PEN' | free text
//   minute            number?  67
//   minuteDisplay     string?  "45+2'"
//   homeScore         number?
//   awayScore         number?
//   homeScoreHt       number?
//   awayScoreHt       number?
//   homePens          number?
//   awayPens          number?
//   winnerSide        'home'|'away'|null   only set when the score is level
//   venue             string?
//   attendance        number?
//   referee           string?
//   round             string?  'Speelronde 4'
//   matchday          number?
//   stage             string?  'league' | 'quarterfinal' | …
//   events            ProviderEvent[]
//
// @typedef ProviderEvent
//   type          'goal'|'own_goal'|'penalty'|'penalty_missed'|'yellow'|
//                 'second_yellow'|'red'|'substitution'|'var'
//   side          'home'|'away'
//   minute        number?
//   minuteExtra   number?
//   minuteDisplay string?
//   player        string?
//   assist        string?
//   related       string?   player replaced, for a substitution
//   homeScore     number?   running score after this event, when known
//   awayScore     number?
//   detail        string?
//
// @typedef ProviderDetail
//   events      ProviderEvent[]
//   lineups     { side, formation, coach, players: [{name, shirt, position, starter, captain, x, y, rating}] }[]
//   stats       { side, metric, value }[]
//
// @typedef ProviderStanding
//   teamName    string
//   groupKey    string
//   position    number
//   played/won/drawn/lost/goalsFor/goalsAgainst/points  number
//   form        string?   'WWDLW'
// ---------------------------------------------------------------------------

import * as espn from './espn.js';
import * as sportsdb from './sportsdb.js';
import * as footballdata from './footballdata.js';
import * as replay from './replay.js';
import config from '../config.js';

const ALL = { espn, sportsdb, footballdata, replay };

/**
 * The providers to try, in order. Demo mode swaps the whole chain for the
 * offline replay. football-data.org only joins the chain when a token has been
 * configured — an unconfigured provider that always throws is just a slow
 * failure on every sync.
 */
export function activeProviders() {
  if (config.demoMode) return [replay];
  const chain = config.providers.map((n) => ALL[n]).filter(Boolean);
  if (footballdata.isConfigured() && !chain.includes(footballdata)) chain.push(footballdata);
  return chain;
}

export function providerByName(name) {
  return ALL[name] || null;
}

/** Normalise anything a provider says about status into our vocabulary. */
export const STATUSES = new Set([
  'scheduled', 'live', 'halftime', 'finished', 'postponed', 'cancelled', 'abandoned',
]);

export { espn, sportsdb, replay };
