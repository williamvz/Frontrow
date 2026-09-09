// The club theme engine.
//
// Frontrow has no brand colour of its own. You pick your club and the entire
// interface — accents, the tint in the near-black surfaces, the glow on a live
// row, the fill behind your team's name — is derived from that club's colours.
// Ajax turns the app warm red; Heerenveen turns it cold blue; Fortuna Sittard
// turns it acid yellow; Telstar, who play in white and black, get a monochrome
// treatment that looks deliberate rather than broken.
//
// Three rules make that safe rather than reckless:
//
//   1. NOTHING IS USED RAW. Every club colour passes through OKLCH clamps and
//      a WCAG contrast guarantee before it reaches a pixel. Fortuna's #FFE500
//      is a beautiful accent on black and an unreadable one on white; the
//      engine solves that instead of hoping.
//   2. THE TINT IS A WHISPER. Surfaces carry the club hue at chroma ~0.01 —
//      enough that Ajax and Heerenveen feel different before you have read a
//      word, not enough to be "a red app".
//   3. STATE IS NEVER CLUB-COLOURED. Live, won, drawn, lost keep fixed hues.
//      An Ajax fan must still be able to tell "my team's accent" from "this
//      match is live", and they are both red.

import {
  hexToOklch, oklch, ensureContrast, contrast, isAchromatic, hueDistance,
} from './color.js';

// Frontrow's fallback identity, used before a club is chosen. Dutch orange,
// pulled back from traffic-cone territory.
export const HOUSE = { primary: '#F36C21', secondary: '#0B4DA2' };

// Status hues are constants of the design, not of the club.
const STATUS = {
  live: { L: 0.655, C: 0.215, H: 25 },     // a vivid, unmistakable red
  win: { L: 0.735, C: 0.165, H: 150 },
  draw: { L: 0.720, C: 0.030, H: 250 },
  loss: { L: 0.640, C: 0.140, H: 20 },
  warn: { L: 0.800, C: 0.150, H: 78 },
  info: { L: 0.740, C: 0.120, H: 240 },
};

const DARK = {
  bg: 0.145, s1: 0.190, s2: 0.232, s3: 0.280,
  border: 0.305, borderStrong: 0.390,
  t1: 0.975, t2: 0.800, t3: 0.660, t4: 0.520,
  tint: 0.011, tintStrong: 0.018,
};

const LIGHT = {
  bg: 0.975, s1: 1.000, s2: 0.960, s3: 0.930,
  border: 0.885, borderStrong: 0.800,
  t1: 0.235, t2: 0.400, t3: 0.520, t4: 0.620,
  tint: 0.008, tintStrong: 0.014,
};

/**
 * Decide what the accent hue actually is.
 *
 * A club whose primary is black or white has no usable hue, so the engine
 * falls to its secondary, and if that is achromatic too it commits to a
 * monochrome theme rather than inventing a colour the club does not own.
 */
function chooseAccent(primary, secondary) {
  const pAchromatic = isAchromatic(primary);
  const sAchromatic = isAchromatic(secondary);

  if (!pAchromatic) return { source: hexToOklch(primary), mono: false, from: 'primary' };
  if (!sAchromatic) return { source: hexToOklch(secondary), mono: false, from: 'secondary' };
  return { source: null, mono: true, from: 'mono' };
}

/**
 * The second accent, used for the away side of a fixture, the secondary chip
 * and the "other" series in a chart. It has to be visibly different from the
 * first — two reds side by side is worse than one.
 */
function chooseAccent2(accentH, primary, secondary, mono) {
  if (mono) return { L: 0.70, C: 0.075, H: (accentH + 200) % 360 };
  const candidates = [secondary, primary].filter(Boolean).map(hexToOklch).filter(Boolean);
  const usable = candidates.find((c) => c.C > 0.04 && hueDistance(c.H, accentH) > 28);
  if (usable) return usable;
  // The club's own palette offers nothing distinct — Ajax's second colour is
  // white. Rotate away from the accent, but at low chroma: this is a companion
  // for the away side and the second series in a chart, not a rival brand.
  return { L: 0.74, C: 0.085, H: (accentH + 165) % 360 };
}

/**
 * Build the complete token set for one club, in one mode.
 * @returns {Record<string,string>} CSS custom property name -> hex
 */
export function buildTheme({ primary, secondary, mode = 'dark' } = {}) {
  const P = primary || HOUSE.primary;
  const S = secondary || HOUSE.secondary;
  const M = mode === 'light' ? LIGHT : DARK;
  const dark = mode !== 'light';

  const { source, mono } = chooseAccent(P, S);
  // Monochrome clubs get the neutral hue of their own primary, which keeps
  // even a black-and-white theme from being flat grey.
  const H = mono ? (hexToOklch(P)?.H ?? 250) : source.H;
  const C = mono ? 0 : Math.min(source.C, 0.19);

  // ------------------------------------------------------------- surfaces
  // The club hue at a whisper of chroma. This is what makes an Ajax install
  // feel warm and a Heerenveen install feel cold without either being loud.
  const tint = mono ? 0.004 : M.tint;
  const tintStrong = mono ? 0.007 : M.tintStrong;

  const surface = (L, c = tint) => oklch(L, c, H);
  const bg = surface(M.bg);

  // --------------------------------------------------------------- accent
  // Clamp into a band that reads as an accent rather than as a highlighter,
  // then guarantee it against the background it will actually sit on.
  const accentL = mono
    ? (dark ? 0.93 : 0.28)
    : Math.min(Math.max(source.L, dark ? 0.58 : 0.40), dark ? 0.80 : 0.62);
  let accent = oklch(accentL, mono ? 0.012 : C, H);
  accent = ensureContrast(accent, bg, 4.5);

  // A large-text/graphic variant only needs 3:1, which lets a club keep more
  // of its real colour in headlines and crest-sized marks.
  const accentGraphic = ensureContrast(oklch(
    mono ? (dark ? 0.88 : 0.32) : Math.min(Math.max(source.L, dark ? 0.52 : 0.34), dark ? 0.84 : 0.70),
    mono ? 0.010 : C, H,
  ), bg, 3);

  const accentOk = hexToOklch(accent);
  const onAccent = contrast('#0A0A0B', accent) >= contrast('#FFFFFF', accent) ? '#0A0A0B' : '#FFFFFF';

  const a2src = chooseAccent2(H, P, S, mono);
  const accent2 = ensureContrast(
    oklch(
      Math.min(Math.max(a2src.L, dark ? 0.60 : 0.40), dark ? 0.82 : 0.62),
      Math.min(a2src.C, 0.17), a2src.H,
    ), bg, 4.5,
  );

  const status = Object.fromEntries(
    Object.entries(STATUS).map(([k, v]) => [
      k, ensureContrast(oklch(dark ? v.L : v.L - 0.16, v.C, v.H), bg, 4.5),
    ]),
  );

  return {
    '--bg': bg,
    '--surface-1': surface(M.s1),
    '--surface-2': surface(M.s2, tintStrong),
    '--surface-3': surface(M.s3, tintStrong),
    '--border': surface(M.border, tint),
    '--border-strong': surface(M.borderStrong, tintStrong),

    '--text-1': oklch(M.t1, mono ? 0.003 : 0.006, H),
    '--text-2': oklch(M.t2, mono ? 0.004 : 0.010, H),
    '--text-3': oklch(M.t3, mono ? 0.004 : 0.012, H),
    '--text-4': oklch(M.t4, mono ? 0.004 : 0.012, H),

    '--accent': accent,
    '--accent-graphic': accentGraphic,
    '--accent-hi': oklch(Math.min(accentOk.L + 0.10, 0.95), accentOk.C * 0.92, H),
    '--accent-dim': oklch(Math.max(accentOk.L - 0.14, 0.20), accentOk.C * 0.85, H),
    // A tinted fill for "this row is your team" — strong enough to notice at a
    // glance, weak enough that text stays at full contrast on top of it.
    '--accent-soft': oklch(dark ? 0.255 : 0.930, Math.min(C * 0.55, 0.07), H),
    '--accent-veil': oklch(dark ? 0.205 : 0.960, Math.min(C * 0.35, 0.04), H),
    '--on-accent': onAccent,
    '--accent-2': accent2,

    '--live': status.live,
    '--win': status.win,
    '--draw': status.draw,
    '--loss': status.loss,
    '--warn': status.warn,
    '--info': status.info,

    // Raw club colours, unclamped — for crests, kit stripes and the payload
    // Home Assistant sends to a light bulb, where "readable" is not the goal.
    '--club-primary': P,
    '--club-secondary': S,
    '--accent-h': String(Math.round(H)),
  };
}

/** Apply a theme to a DOM element (the document root, normally). */
export function applyTheme(tokens, el = document.documentElement) {
  for (const [k, v] of Object.entries(tokens)) el.style.setProperty(k, v);
  el.style.colorScheme = tokens['--bg'] && isDarkHex(tokens['--bg']) ? 'dark' : 'light';
}

const isDarkHex = (hex) => (hexToOklch(hex)?.L ?? 0) < 0.5;

/** The same tokens as a CSS text block — used for SSR and for the TV board. */
export const themeToCss = (tokens, selector = ':root') =>
  `${selector}{${Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';')}}`;

/** Every token, for one club, in both modes. */
export const buildThemePair = (club) => ({
  dark: buildTheme({ ...club, mode: 'dark' }),
  light: buildTheme({ ...club, mode: 'light' }),
});
