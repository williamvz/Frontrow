// The system test: a whole matchday, played through the real sync engine, with
// no network. It asserts the things that actually matter on a Saturday —
// scores land, goals are recorded exactly once, the table is right at full
// time, and nothing is announced twice.

import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb, fakeClock } from './helpers.js';

const tmp = useTempDb('sync');

const { getDb, closeDb } = await import('../src/db/database.js');
const repo = await import('../src/db/repo.js');
const replay = await import('../src/providers/replay.js');
const { syncCompetition } = await import('../src/sync/engine.js');
const { refreshStandings, computeTable, topScorers } = await import('../src/sync/standings.js');
const { bus } = await import('../src/realtime/hub.js');

const clock = fakeClock();
replay.setClock(clock.now);
replay.start(clock.now());

getDb();
repo.seed();

const eredivisie = repo.getCompetition('eredivisie');
const WINDOW = { from: '2026-09-06', to: '2026-09-06' };

const announcements = [];
bus.on('match:goal', (g) => announcements.push({ type: 'goal', ...g }));
bus.on('match:status', (s) => announcements.push({ type: 'status', ...s }));

test.after(() => { closeDb(); tmp.cleanup(); });

test('a matchday plays out through the sync engine', async (t) => {
  await t.test('kick-off: nine matches appear, none finished', async () => {
    const result = await syncCompetition(eredivisie, { ...WINDOW, job: 'boot' });
    assert.equal(result.provider, 'replay');
    assert.equal(result.seen, 9);
    const rows = getDb().prepare('SELECT status, COUNT(*) n FROM matches GROUP BY status').all();
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, r.n]));
    assert.equal((byStatus.live || 0) + (byStatus.scheduled || 0), 9);
    assert.equal(byStatus.finished, undefined);
  });

  await t.test('the clock advances and goals arrive with a scorer', async () => {
    clock.advanceMinutes(6);
    await syncCompetition(eredivisie, { ...WINDOW, job: 'live' });

    const goals = getDb().prepare(
      "SELECT * FROM match_events WHERE type IN ('goal','penalty','own_goal')",
    ).all();
    assert.ok(goals.length > 0, 'expected at least one goal by the 45th minute');
    assert.ok(goals.every((g) => g.player_name), 'every goal has a scorer');
    assert.ok(goals.every((g) => g.minute > 0 && g.minute <= 96), 'every goal has a sane minute');

    const announced = announcements.filter((a) => a.type === 'goal');
    assert.equal(announced.length, goals.length, 'one announcement per goal');
  });

  await t.test('re-syncing the same state changes nothing and announces nothing', async () => {
    const before = announcements.length;
    const events = getDb().prepare('SELECT COUNT(*) n FROM match_events').get().n;

    await syncCompetition(eredivisie, { ...WINDOW, job: 'live' });
    await syncCompetition(eredivisie, { ...WINDOW, job: 'live' });

    assert.equal(getDb().prepare('SELECT COUNT(*) n FROM match_events').get().n, events,
      'a repeated sync must not duplicate events');
    assert.equal(announcements.length, before,
      'a repeated sync must not re-announce a goal');
  });

  await t.test('full time: every match finishes and the scores are final', async () => {
    clock.advanceMinutes(20);
    await syncCompetition(eredivisie, { ...WINDOW, job: 'live' });

    const matches = getDb().prepare('SELECT * FROM matches').all();
    assert.equal(matches.length, 9);
    assert.ok(matches.every((m) => m.status === 'finished'), 'all nine matches finished');
    assert.ok(matches.every((m) => m.home_score != null && m.away_score != null));

    // The score on the match must equal the goals in its own timeline.
    for (const m of matches) {
      const events = repo.eventsFor(m.id).filter((e) => ['goal', 'penalty', 'own_goal'].includes(e.type));
      const home = events.filter((e) => (e.type === 'own_goal' ? e.team_id !== m.home_team_id : e.team_id === m.home_team_id)).length;
      const away = events.length - home;
      assert.equal(m.home_score, home, `${m.id}: home score disagrees with its timeline`);
      assert.equal(m.away_score, away, `${m.id}: away score disagrees with its timeline`);
    }
  });

  await t.test('the table adds up', () => {
    const season = repo.currentSeason('eredivisie');
    refreshStandings(season.id, 'eredivisie');
    const table = computeTable(season.id);

    assert.equal(table.length, 18, 'all eighteen clubs are in the table');
    const played = table.filter((r) => r.played > 0);
    assert.equal(played.length, 18, 'every club that played has a row');

    for (const row of played) {
      assert.equal(row.played, row.won + row.drawn + row.lost, `${row.name}: results do not add up`);
      assert.equal(row.points, row.won * 3 + row.drawn, `${row.name}: points do not match results`);
    }

    // Goals for across the league must equal goals against across the league.
    const gf = table.reduce((n, r) => n + r.goals_for, 0);
    const ga = table.reduce((n, r) => n + r.goals_against, 0);
    assert.equal(gf, ga, 'league goals for and against must balance');

    // Ordering: points, then goal difference, then goals scored.
    for (let i = 1; i < table.length; i++) {
      const a = table[i - 1];
      const b = table[i];
      const ok = a.points > b.points
        || (a.points === b.points && a.goal_diff > b.goal_diff)
        || (a.points === b.points && a.goal_diff === b.goal_diff && a.goals_for >= b.goals_for);
      assert.ok(ok, `table order wrong between ${a.name} and ${b.name}`);
    }
  });

  await t.test('the top-scorer list matches the goals actually scored', () => {
    const season = repo.currentSeason('eredivisie');
    const scorers = topScorers(season.id, 50);
    const totalFromScorers = scorers.reduce((n, s) => n + s.goals, 0);
    const goalsWithScorer = getDb().prepare(
      "SELECT COUNT(*) n FROM match_events WHERE type IN ('goal','penalty') AND player_name IS NOT NULL",
    ).get().n;
    assert.equal(totalFromScorers, goalsWithScorer);
    if (scorers.length > 1) {
      assert.ok(scorers[0].goals >= scorers[1].goals, 'scorers are ordered');
    }
  });

  await t.test('a finished match is never un-finished by a quiet provider', async () => {
    const before = getDb().prepare("SELECT COUNT(*) n FROM matches WHERE status = 'finished'").get().n;
    // Rewind the replay clock: the provider now reports these matches as
    // scheduled again, which is exactly the shape of a provider glitch.
    clock.advanceMinutes(-40);
    await syncCompetition(eredivisie, { ...WINDOW, job: 'live' });
    const after = getDb().prepare("SELECT COUNT(*) n FROM matches WHERE status = 'finished'").get().n;
    assert.equal(after, before, 'a finished match must stay finished');
    clock.advanceMinutes(40);
  });
});
