// The replay provider: a complete, deterministic Eredivisie matchday that runs
// without a network connection.
//
// It exists for three reasons, in order of importance:
//   1. tests — the whole system (sync, scoring, standings, SSE, notifications)
//      is exercised end to end against a feed that never flakes;
//   2. demo mode — flip `demo_mode` in the add-on and you can watch the app do
//      its thing on a Tuesday afternoon in July, which is the only honest way
//      to check that your phone notifications are set up correctly;
//   3. development — the UI can be built and reviewed against live-looking data.
//
// A simulated 90 minutes is compressed into REPLAY_MINUTES of real time
// (default 12), so a full matchday plays out in about a quarter of an hour.
// Everything is derived from a seeded PRNG, so the same match always produces
// the same goals in the same minute — which is what makes it testable.

import { hashId } from '../util/text.js';

export const name = 'replay';
export const supports = {
  scores: true, events: true, lineups: true, stats: true, standings: false, schedule: true,
};

const REAL_MINUTES = Number(process.env.REPLAY_MINUTES || 12);
const SIMULATED_MINUTES = 90 + 6;                 // 90 plus stoppage
const SPEED = SIMULATED_MINUTES / REAL_MINUTES;   // simulated minutes per real minute

// The clock is injectable so tests can jump to the 88th minute instantly
// instead of waiting for it.
let clock = () => Date.now();
export const setClock = (fn) => { clock = fn; };
export const resetClock = () => { clock = () => Date.now(); };

let originMs = null;
/** Start (or restart) the replay now. Called once when demo mode boots. */
export function start(at = clock()) { originMs = at; }
export function origin() { return originMs ?? (originMs = clock()); }

// ---------------------------------------------------------------- seeded RNG
// mulberry32 — small, fast, and identical on every machine.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const seedOf = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// -------------------------------------------------------------- the matchday
// Nine fixtures, staggered the way a real Eredivisie Saturday is: an early
// kick-off, the 18:45 block, and the 20:00 headliner.
const FIXTURES = [
  { home: 'Ajax', away: 'PSV', offsetMin: 0, venue: 'Johan Cruijff ArenA' },
  { home: 'Feyenoord', away: 'FC Twente', offsetMin: 0, venue: 'De Kuip' },
  { home: 'AZ', away: 'FC Utrecht', offsetMin: 2, venue: 'AFAS Stadion' },
  { home: 'Go Ahead Eagles', away: 'NEC', offsetMin: 2, venue: 'De Adelaarshorst' },
  { home: 'sc Heerenveen', away: 'FC Groningen', offsetMin: 4, venue: 'Abe Lenstra Stadion' },
  { home: 'Sparta Rotterdam', away: 'PEC Zwolle', offsetMin: 4, venue: 'Het Kasteel' },
  { home: 'Fortuna Sittard', away: 'Excelsior', offsetMin: 6, venue: 'Fortuna Sittard Stadion' },
  { home: 'Telstar', away: 'SC Cambuur', offsetMin: 6, venue: 'BUKO Stadion' },
  { home: 'ADO Den Haag', away: 'Willem II', offsetMin: 8, venue: 'Bingoal Stadion' },
];

// Deliberately generic names: this is simulated football, and putting real
// players' names on invented goals would be a small lie the app does not need.
const SQUADS = {
  keeper: ['Verbruggen', 'Bijlow', 'Owusu-Oduro', 'Unnerstall'],
  outfield: [
    'Van Dijk', 'De Vries', 'Jansen', 'Bakker', 'Visser', 'Smit', 'Meijer', 'Mulder',
    'De Boer', 'Hendriks', 'Dijkstra', 'Kramer', 'Van Leeuwen', 'Vos', 'Peters',
    'Willems', 'Koning', 'Brouwer', 'Van Dam', 'Timmermans',
  ],
};

function squadFor(teamName) {
  const r = rng(seedOf(`squad:${teamName}`));
  const pool = [...SQUADS.outfield].sort(() => r() - 0.5);
  return {
    keeper: SQUADS.keeper[Math.floor(r() * SQUADS.keeper.length)],
    players: pool.slice(0, 16),
  };
}

/** The whole script for one fixture, computed once and cached. */
const scripts = new Map();
function scriptFor(fx) {
  const key = `${fx.home}-${fx.away}`;
  if (scripts.has(key)) return scripts.get(key);

  const r = rng(seedOf(`match:${key}`));
  const totalGoals = [0, 1, 1, 2, 2, 2, 3, 3, 4, 5][Math.floor(r() * 10)];
  const homeSquad = squadFor(fx.home);
  const awaySquad = squadFor(fx.away);

  const events = [];
  let home = 0; let away = 0;

  for (let i = 0; i < totalGoals; i++) {
    // Goals cluster slightly towards the second half, as they do in life.
    const minute = Math.max(2, Math.min(94, Math.floor(3 + r() ** 0.8 * 90)));
    const side = r() < 0.54 ? 'home' : 'away';           // home advantage
    const squad = side === 'home' ? homeSquad : awaySquad;
    const kind = r() < 0.08 ? 'penalty' : r() < 0.05 ? 'own_goal' : 'goal';
    events.push({
      type: kind, side, minute,
      player: squad.players[Math.floor(r() * squad.players.length)],
      assist: kind === 'goal' && r() < 0.6
        ? squad.players[Math.floor(r() * squad.players.length)] : null,
    });
  }

  const cardCount = Math.floor(r() * 5);
  for (let i = 0; i < cardCount; i++) {
    const side = r() < 0.5 ? 'home' : 'away';
    const squad = side === 'home' ? homeSquad : awaySquad;
    events.push({
      type: r() < 0.06 ? 'red' : 'yellow', side,
      minute: Math.max(8, Math.floor(r() * 92)),
      player: squad.players[Math.floor(r() * squad.players.length)],
    });
  }

  for (const side of ['home', 'away']) {
    const squad = side === 'home' ? homeSquad : awaySquad;
    for (let i = 0; i < 3; i++) {
      events.push({
        type: 'substitution', side,
        minute: 46 + Math.floor(r() * 40),
        player: squad.players[11 + i],
        related: squad.players[Math.floor(r() * 11)],
      });
    }
  }

  events.sort((a, b) => a.minute - b.minute);
  // Walk the timeline once to stamp the running score onto each goal.
  for (const e of events) {
    if (['goal', 'penalty', 'own_goal'].includes(e.type)) {
      const scoresFor = e.type === 'own_goal' ? (e.side === 'home' ? 'away' : 'home') : e.side;
      if (scoresFor === 'home') home += 1; else away += 1;
    }
    e.homeScore = home; e.awayScore = away;
  }

  const script = {
    events,
    finalHome: home,
    finalAway: away,
    htHome: events.filter((e) => e.minute <= 45 && e.homeScore !== undefined).at(-1)?.homeScore ?? 0,
    htAway: events.filter((e) => e.minute <= 45 && e.awayScore !== undefined).at(-1)?.awayScore ?? 0,
    homeSquad, awaySquad,
    formationHome: ['4-3-3', '4-2-3-1', '3-4-3'][Math.floor(r() * 3)],
    formationAway: ['4-3-3', '4-4-2', '5-3-2'][Math.floor(r() * 3)],
  };
  scripts.set(key, script);
  return script;
}

/** Where a fixture is right now: simulated minute and status. */
function clockFor(fx) {
  const kickoffMs = origin() + fx.offsetMin * 60000;
  const elapsedRealMin = (clock() - kickoffMs) / 60000;
  if (elapsedRealMin < 0) return { status: 'scheduled', minute: null, kickoffMs };
  const simMinute = elapsedRealMin * SPEED;
  if (simMinute >= SIMULATED_MINUTES) return { status: 'finished', minute: 90, kickoffMs };
  // A compressed but real half-time break, so the app's halftime state is exercised.
  if (simMinute >= 45 && simMinute < 50) return { status: 'halftime', minute: 45, kickoffMs };
  const minute = simMinute < 45 ? Math.floor(simMinute) : Math.floor(simMinute - 5);
  return { status: 'live', minute: Math.max(1, Math.min(94, minute)), kickoffMs };
}

export async function fetchMatches({ competition, from, to }) {
  if (competition.id !== 'eredivisie') return [];
  const out = [];
  for (const fx of FIXTURES) {
    const script = scriptFor(fx);
    const { status, minute, kickoffMs } = clockFor(fx);
    const kickoffIso = new Date(kickoffMs).toISOString();
    const day = kickoffIso.slice(0, 10);
    if (day < from || day > to) continue;

    const shown = status === 'scheduled'
      ? []
      : script.events.filter((e) => e.minute <= (status === 'finished' ? 95 : minute));
    const last = shown.filter((e) => e.homeScore !== undefined).at(-1);

    out.push({
      providerId: hashId('replay', fx.home, fx.away),
      competitionId: 'eredivisie',
      homeName: fx.home,
      awayName: fx.away,
      homeProviderId: `replay-${hashId(fx.home)}`,
      awayProviderId: `replay-${hashId(fx.away)}`,
      kickoffIso,
      status,
      statusDetail: status === 'finished' ? 'FT' : status === 'halftime' ? 'Rust' : null,
      minute: status === 'live' ? minute : null,
      minuteDisplay: status === 'live' ? `${minute}'` : null,
      homeScore: status === 'scheduled' ? null : (status === 'finished' ? script.finalHome : last?.homeScore ?? 0),
      awayScore: status === 'scheduled' ? null : (status === 'finished' ? script.finalAway : last?.awayScore ?? 0),
      homeScoreHt: ['halftime', 'finished'].includes(status) ? script.htHome : null,
      awayScoreHt: ['halftime', 'finished'].includes(status) ? script.htAway : null,
      homePens: null, awayPens: null, winnerSide: null,
      venue: fx.venue,
      attendance: null, referee: null,
      round: 'Speelronde 4', matchday: 4, stage: 'league',
      events: shown.map((e) => ({ ...e, minuteDisplay: `${e.minute}'` })),
    });
  }
  return out;
}

export async function fetchDetail({ providerMatchId }) {
  const fx = FIXTURES.find((f) => hashId('replay', f.home, f.away) === providerMatchId);
  if (!fx) return null;
  const script = scriptFor(fx);
  const { status, minute } = clockFor(fx);
  const cut = status === 'finished' ? 95 : status === 'scheduled' ? -1 : minute;

  const lineup = (squad, side, formation) => ({
    side, formation,
    coach: side === 'home' ? 'De trainer' : 'De bezoekende trainer',
    players: [
      { name: squad.keeper, shirt: 1, position: 'GK', starter: true, captain: false },
      ...squad.players.slice(0, 10).map((n, i) => ({
        name: n, shirt: i + 2,
        position: i < 4 ? 'DF' : i < 7 ? 'MF' : 'FW',
        starter: true, captain: i === 0,
      })),
      ...squad.players.slice(11, 16).map((n, i) => ({
        name: n, shirt: i + 12, position: 'MF', starter: false, captain: false,
      })),
    ],
  });

  // Possession and shots drift with the score, so the stats bar is not a
  // meaningless 50/50 on every match.
  const r = rng(seedOf(`stats:${fx.home}-${fx.away}`));
  const possHome = Math.round(38 + r() * 24);
  const stats = [
    { side: 'home', metric: 'possessionPct', value: possHome },
    { side: 'away', metric: 'possessionPct', value: 100 - possHome },
    { side: 'home', metric: 'totalShots', value: 6 + Math.floor(r() * 12) },
    { side: 'away', metric: 'totalShots', value: 4 + Math.floor(r() * 12) },
    { side: 'home', metric: 'shotsOnTarget', value: 2 + Math.floor(r() * 6) },
    { side: 'away', metric: 'shotsOnTarget', value: 1 + Math.floor(r() * 6) },
    { side: 'home', metric: 'wonCorners', value: Math.floor(r() * 10) },
    { side: 'away', metric: 'wonCorners', value: Math.floor(r() * 10) },
    { side: 'home', metric: 'foulsCommitted', value: 5 + Math.floor(r() * 10) },
    { side: 'away', metric: 'foulsCommitted', value: 5 + Math.floor(r() * 10) },
  ];

  return {
    events: script.events.filter((e) => e.minute <= cut).map((e) => ({ ...e, minuteDisplay: `${e.minute}'` })),
    lineups: [
      lineup(script.homeSquad, 'home', script.formationHome),
      lineup(script.awaySquad, 'away', script.formationAway),
    ],
    stats,
  };
}

export async function fetchStandings() { return null; }

/** Everything the replay knows, for tests that want to assert on the script. */
export const _internals = { FIXTURES, scriptFor, clockFor, SPEED, SIMULATED_MINUTES };
