// The club theme engine has one job: never produce an unreadable interface,
// for any club, in either mode. These tests run it over every club Frontrow
// ships with — including the awkward ones — and assert WCAG AA on every text
// token. If a future club is added with a strange colour, this fails first.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTheme, HOUSE } from '../src/theme/theme.js';
import { contrast, hexToOklch, hueDistance } from '../src/theme/color.js';
// The seed list lives with the backend because that is what writes it to the
// database; the theme engine is the only frontend code that reads it directly,
// and only here, in a test.
import TEAMS from '../../backend/src/db/seed/teams.js';

const MODES = ['dark', 'light'];

// WCAG AA: 4.5:1 for body text, 3:1 for large text and meaningful graphics.
const AA = 4.5;
const AA_LARGE = 3;

for (const mode of MODES) {
  test(`${mode}: every club produces a readable theme`, () => {
    for (const club of TEAMS) {
      const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color, mode });
      const bg = t['--bg'];
      const label = `${club.id} (${mode}, ${club.primary_color}/${club.secondary_color})`;

      for (const token of ['--text-1', '--text-2', '--text-3']) {
        assert.ok(contrast(t[token], bg) >= AA,
          `${label}: ${token} ${t[token]} on ${bg} = ${contrast(t[token], bg).toFixed(2)}:1, need ${AA}`);
      }
      assert.ok(contrast(t['--text-4'], bg) >= AA_LARGE, `${label}: --text-4 too faint`);

      for (const token of ['--accent', '--accent-2', '--live', '--win', '--loss', '--warn']) {
        assert.ok(contrast(t[token], bg) >= AA,
          `${label}: ${token} ${t[token]} on ${bg} = ${contrast(t[token], bg).toFixed(2)}:1`);
      }

      assert.ok(contrast(t['--accent-graphic'], bg) >= AA_LARGE, `${label}: --accent-graphic too faint`);
      assert.ok(contrast(t['--on-accent'], t['--accent']) >= AA,
        `${label}: text on the accent fill is unreadable`);

      // Text must stay readable on the "your team" tinted row, not just on bg.
      for (const surface of ['--surface-1', '--surface-2', '--accent-soft', '--accent-veil']) {
        assert.ok(contrast(t['--text-1'], t[surface]) >= AA,
          `${label}: --text-1 on ${surface} = ${contrast(t['--text-1'], t[surface]).toFixed(2)}:1`);
      }
    }
  });

  test(`${mode}: surfaces are ordered and distinguishable`, () => {
    for (const club of TEAMS) {
      const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color, mode });
      const L = (k) => hexToOklch(t[k]).L;
      const rising = mode === 'dark';
      const order = ['--bg', '--surface-1', '--surface-2', '--surface-3'];
      for (let i = 1; i < order.length; i++) {
        const delta = L(order[i]) - L(order[i - 1]);
        assert.ok(rising ? delta > 0.01 : delta !== 0,
          `${club.id} (${mode}): ${order[i]} is not distinct from ${order[i - 1]}`);
      }
    }
  });
}

test('the two accents are never confusable', () => {
  for (const club of TEAMS) {
    const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color });
    const a = hexToOklch(t['--accent']);
    const b = hexToOklch(t['--accent-2']);
    const apart = hueDistance(a.H, b.H) > 22 || Math.abs(a.L - b.L) > 0.14 || Math.abs(a.C - b.C) > 0.07;
    assert.ok(apart, `${club.id}: --accent ${t['--accent']} and --accent-2 ${t['--accent-2']} look the same`);
  }
});

test('monochrome clubs get a monochrome theme, not an invented colour', () => {
  // Telstar play in white and black; Heracles in black and white.
  for (const id of ['telstar', 'heracles']) {
    const club = TEAMS.find((c) => c.id === id);
    const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color });
    assert.ok(hexToOklch(t['--accent']).C < 0.05, `${id}: accent should stay neutral, got ${t['--accent']}`);
  }
});

test('chromatic clubs keep their own hue', () => {
  const cases = { ajax: 23, heerenveen: 257, fortuna_sittard: 101, groningen: 150 };
  for (const [id, expected] of Object.entries(cases)) {
    const club = TEAMS.find((c) => c.id === id);
    const t = buildTheme({ primary: club.primary_color, secondary: club.secondary_color });
    const got = hexToOklch(t['--accent']).H;
    assert.ok(hueDistance(got, expected) < 15,
      `${id}: accent hue drifted to ${got.toFixed(0)}, expected near ${expected}`);
  }
});

test('falls back to the house theme with no club at all', () => {
  const t = buildTheme({});
  assert.equal(t['--club-primary'], HOUSE.primary);
  assert.ok(contrast(t['--text-1'], t['--bg']) >= AA);
});
