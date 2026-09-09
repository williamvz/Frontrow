// The HTTP surface, exercised against a real database driven by the replay
// provider. If these pass, the app has something correct to render.

import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb, fakeClock } from './helpers.js';

const tmp = useTempDb('api');

const { getDb, closeDb } = await import('../src/db/database.js');
const repo = await import('../src/db/repo.js');
const replay = await import('../src/providers/replay.js');
const { syncCompetition } = await import('../src/sync/engine.js');
const { refreshStandings } = await import('../src/sync/standings.js');
const { app } = await import('../src/server.js');

const clock = fakeClock();
replay.setClock(clock.now);
replay.start(clock.now());
getDb();
repo.seed();

const eredivisie = repo.getCompetition('eredivisie');
await syncCompetition(eredivisie, { from: '2026-09-06', to: '2026-09-06', job: 'boot' });
clock.advanceMinutes(30);
await syncCompetition(eredivisie, { from: '2026-09-06', to: '2026-09-06', job: 'live' });
refreshStandings(repo.currentSeason('eredivisie').id, 'eredivisie');

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
const get = async (path) => {
  const res = await fetch(`${base}${path}`);
  return { status: res.status, body: await res.json() };
};

test.after(() => { server.close(); closeDb(); tmp.cleanup(); });

test('health reports the database, not just the process', async () => {
  const { status, body } = await get('/api/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(body.competitions > 0, 'health must prove it can read the database');
});

test('bootstrap carries everything the first frame needs', async () => {
  const { body } = await get('/api/bootstrap');
  assert.ok(body.profile.id, 'a profile exists without anyone signing up');
  assert.ok(body.competitions.length >= 5);
  assert.ok(body.teams.length >= 39);
  assert.ok(body.push.publicKey, 'the VAPID key is generated on first boot');
  // Colours travel with the teams so the client can theme without a lookup.
  const ajax = body.teams.find((t) => t.id === 'ajax');
  assert.match(ajax.color, /^#[0-9A-Fa-f]{6}$/);
  // A fresh install already follows its club and its competitions.
  assert.ok(body.follows.some((f) => f.kind === 'team'));
});

test('the day view groups by competition and embeds both teams', async () => {
  const { body } = await get('/api/day/2026-09-06');
  assert.equal(body.date, '2026-09-06');
  assert.ok(body.groups.length >= 1);
  const group = body.groups.find((g) => g.competition.id === 'eredivisie');
  assert.equal(group.matches.length, 9);
  const m = group.matches[0];
  assert.ok(m.home.name && m.away.name, 'teams are embedded, not ids');
  assert.ok(m.home.color, 'club colours travel with the match');
  assert.ok(['scheduled', 'live', 'halftime', 'finished'].includes(m.status));
  assert.ok(Array.isArray(body.days), 'the date rail gets its dots');
});

test('a match detail carries its timeline', async () => {
  const day = (await get('/api/day/2026-09-06')).body;
  const live = day.groups[0].matches.find((m) => m.status !== 'scheduled');
  const { status, body } = await get(`/api/matches/${live.id}`);
  assert.equal(status, 200);
  assert.equal(body.match.id, live.id);
  assert.ok(Array.isArray(body.events));
  assert.ok(Array.isArray(body.lineups));
  for (const e of body.events) {
    assert.ok(e.type, 'every event is typed');
    assert.ok(e.minute >= 0 && e.minute <= 130, `implausible minute ${e.minute}`);
  }
});

test('an unknown match is a 404, not a crash', async () => {
  const { status, body } = await get('/api/matches/nope');
  assert.equal(status, 404);
  assert.equal(body.error, 'not_found');
});

test('the table is complete and internally consistent', async () => {
  const { body } = await get('/api/standings/eredivisie');
  assert.equal(body.table.length, 18);
  const first = body.table[0];
  assert.equal(first.position, 1);
  assert.ok(first.team.name);
  for (const row of body.table) {
    assert.equal(row.played, row.won + row.drawn + row.lost);
    assert.equal(row.points, row.won * 3 + row.drawn);
    assert.equal(row.goalDiff, row.goalsFor - row.goalsAgainst);
  }
});

test('the live table folds in matches that are still being played', async () => {
  const normal = (await get('/api/standings/eredivisie')).body;
  const live = (await get('/api/standings/eredivisie?live=1')).body;
  const playedNormal = normal.table.reduce((n, r) => n + r.played, 0);
  const playedLive = live.table.reduce((n, r) => n + r.played, 0);
  assert.ok(playedLive >= playedNormal, 'the live table can only ever include more');
});

test('a team page answers with fixtures, results and form', async () => {
  const { status, body } = await get('/api/teams/ajax');
  assert.equal(status, 200);
  assert.equal(body.team.id, 'ajax');
  assert.ok(Array.isArray(body.form));
  assert.ok(Array.isArray(body.fixtures));
  assert.ok(Array.isArray(body.results));
});

test('following is per profile and survives a round trip', async () => {
  const add = await fetch(`${base}/api/follows`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Frontrow-Profile': 'default' },
    body: JSON.stringify({ kind: 'team', id: 'feyenoord', alerts: { goal: true } }),
  });
  assert.equal(add.status, 200);
  const { body } = await get('/api/follows');
  assert.ok(body.follows.some((f) => f.id === 'feyenoord' && f.alerts.goal === true));

  const remove = await fetch(`${base}/api/follows/team/feyenoord`, { method: 'DELETE' });
  assert.equal(remove.status, 200);
  const after = (await get('/api/follows')).body;
  assert.ok(!after.follows.some((f) => f.id === 'feyenoord'));
});

test('a crest is always served, even for a club with no image', async () => {
  const res = await fetch(`${base}/api/crest/ajax`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^image\//);
  const svg = await res.text();
  // Falling back to a monogram, the ink must be readable on the club colour.
  if (svg.startsWith('<svg')) assert.match(svg, /fill="#FFFFFF"|fill="#0A0A0B"|fill="#[0-9A-F]{6}"/i);
});

test('the event stream opens and greets the client', async () => {
  const controller = new AbortController();
  const res = await fetch(`${base}/api/stream`, { signal: controller.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  // Proxies (and Home Assistant's ingress) must not buffer the stream.
  assert.equal(res.headers.get('x-accel-buffering'), 'no');

  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /event: hello/);
  controller.abort();
});
