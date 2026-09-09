// Team-name matching is where a football app quietly rots. Providers spell the
// same club a dozen ways, and a miss means a duplicate club, a broken table and
// a match that never appears. These are the spellings that actually occur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { useTempDb } from './helpers.js';

const tmp = useTempDb('matcher');
const { getDb, closeDb } = await import('../src/db/database.js');
const repo = await import('../src/db/repo.js');
const { normalise, matchKey } = await import('../src/util/text.js');

getDb();
repo.seed();

test.after(() => { closeDb(); tmp.cleanup(); });

test('normalisation strips the things providers disagree about', () => {
  assert.equal(normalise('PSV Eindhoven'), 'psv eindhoven');
  assert.equal(normalise("Go Ahead Eagles"), 'go ahead eagles');
  assert.equal(normalise('sc Heerenveen'), 'sc heerenveen');
  assert.equal(normalise('Fortuna Sittard'), 'fortuna sittard');
  // Accents and non-decomposing letters
  assert.equal(normalise('Türkiye'), 'turkiye');
  assert.equal(normalise('Ødegaard'), 'odegaard');
  // Punctuation providers sprinkle around
  assert.equal(normalise('N.E.C.'), 'nec');
  assert.equal(normalise("'s-Hertogenbosch"), 's hertogenbosch');
});

test('the loose key collapses generic club words but never empties a name', () => {
  assert.equal(matchKey('FC Utrecht'), matchKey('Utrecht'));
  assert.equal(matchKey('FC Twente'), matchKey('Twente'));
  // NEC is *only* generic words — it must survive rather than become empty.
  assert.equal(matchKey('NEC'), 'nec');
  assert.notEqual(matchKey('FC Utrecht'), matchKey('FC Groningen'));
});

test('every real spelling resolves to the right club', () => {
  const cases = {
    ajax: ['Ajax', 'AFC Ajax', 'Ajax Amsterdam'],
    psv: ['PSV', 'PSV Eindhoven'],
    feyenoord: ['Feyenoord', 'Feyenoord Rotterdam'],
    az: ['AZ', 'AZ Alkmaar'],
    twente: ['FC Twente', 'Twente', 'Twente Enschede'],
    utrecht: ['FC Utrecht', 'Utrecht'],
    go_ahead_eagles: ['Go Ahead Eagles', 'Go Ahead'],
    nec: ['NEC', 'NEC Nijmegen'],
    heerenveen: ['sc Heerenveen', 'SC Heerenveen', 'Heerenveen'],
    sparta: ['Sparta Rotterdam', 'Sparta'],
    pec_zwolle: ['PEC Zwolle', 'Zwolle'],
    willem_ii: ['Willem II', 'Willem II Tilburg'],
    nederland: ['Netherlands', 'Nederland', 'Holland'],
  };
  for (const [id, spellings] of Object.entries(cases)) {
    for (const spelling of spellings) {
      const resolved = repo.resolveTeam({ provider: 'test', name: spelling });
      assert.equal(resolved, id, `"${spelling}" should resolve to ${id}, got ${resolved}`);
    }
  }
});

test('a provider id is learned once and then used directly', () => {
  repo.resolveTeam({ provider: 'espn', providerTeamId: '139', name: 'Ajax Amsterdam' });
  // A completely different spelling now resolves through the remembered id.
  const again = repo.resolveTeam({ provider: 'espn', providerTeamId: '139', name: 'Total Nonsense FC' });
  assert.equal(again, 'ajax');
  const rows = getDb().prepare('SELECT * FROM team_providers WHERE provider = ?').all('espn');
  assert.equal(rows.length, 1);
});

test('an unknown club is created rather than dropping the match', () => {
  const before = repo.listTeams().length;
  const id = repo.resolveTeam({ provider: 'test', name: 'SV Spakenburg' });
  assert.ok(id, 'an unknown amateur side still gets an id');
  assert.equal(repo.listTeams().length, before + 1);
  // And it is stable: the same name resolves to the same club next time.
  assert.equal(repo.resolveTeam({ provider: 'test', name: 'SV Spakenburg' }), id);
  assert.equal(repo.listTeams().length, before + 1);
});

test('two different unknown clubs do not collide on one id', () => {
  const a = repo.resolveTeam({ provider: 'test', name: 'Quick Boys' });
  const b = repo.resolveTeam({ provider: 'test', name: 'Katwijk' });
  assert.notEqual(a, b);
});
