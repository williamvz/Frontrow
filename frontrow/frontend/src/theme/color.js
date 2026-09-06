// Colour maths. No dependencies — this is the only place in Frontrow that
// knows what a colour *is*, and it needs to be exact rather than convenient.
//
// Two colour spaces are in play:
//   sRGB   — what a hex code is, and what WCAG contrast is defined against;
//   OKLCH  — perceptually uniform, so "make this 15% lighter" actually looks
//            15% lighter whether the colour is yellow or navy. That property
//            is the whole reason a club-derived palette can work at all: the
//            same transformation has to produce a usable accent from Fortuna
//            Sittard's yellow and from Heerenveen's blue.

// ------------------------------------------------------------ sRGB helpers
export function hexToRgb(hex) {
  let h = String(hex || '').trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
  ];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const hex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
export const rgbToHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

/** WCAG 2.x relative luminance. */
export function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1 (identical) to 21 (black on white). */
export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// -------------------------------------------------------------------- OKLab
// Björn Ottosson's OKLab, via the linear-sRGB matrices from his reference.
export function hexToOklch(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map(toLinear);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;

  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}

export function oklchToHex({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);

  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.2914855480 * B;

  const l = l_ ** 3; const m = m_ ** 3; const s = s_ ** 3;

  const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  return rgbToHex([toGamma(r), toGamma(g), toGamma(b)].map(clamp01));
}

/**
 * Bring a colour inside the sRGB gamut by reducing chroma rather than
 * lightness. Converting an out-of-gamut OKLCH naively clips each channel,
 * which shifts the hue — a "slightly too saturated" Ajax red comes back
 * orange. Binary-searching chroma keeps the hue and the lightness honest.
 */
export function gamutMap({ L, C, H }) {
  const inGamut = (c) => {
    const h = (H * Math.PI) / 180;
    const A = c * Math.cos(h); const B = c * Math.sin(h);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
    const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
    const s = (L - 0.0894841775 * A - 1.2914855480 * B) ** 3;
    const r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
    const e = 0.0005;
    return r >= -e && r <= 1 + e && g >= -e && g <= 1 + e && bb >= -e && bb <= 1 + e;
  };

  if (inGamut(C)) return { L, C, H };
  let lo = 0; let hi = C;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(mid)) lo = mid; else hi = mid;
  }
  return { L, C: lo, H };
}

export const oklch = (L, C, H) => oklchToHex(gamutMap({ L, C, H }));

/**
 * Nudge a colour's lightness until it clears a contrast ratio against a
 * background — the guarantee that lets any club colour be used for text.
 * Direction is chosen by which way there is room to go.
 */
export function ensureContrast(hex, backgroundHex, ratio = 4.5, { maxSteps = 40 } = {}) {
  if (contrast(hex, backgroundHex) >= ratio) return hex;
  const base = hexToOklch(hex);
  if (!base) return hex;

  const bgLum = luminance(backgroundHex);
  const direction = bgLum < 0.18 ? 1 : -1;   // lighten on dark, darken on light

  let best = hex;
  for (let i = 1; i <= maxSteps; i++) {
    const L = clamp01(base.L + direction * i * (1 / maxSteps));
    const candidate = oklch(L, base.C, base.H);
    best = candidate;
    if (contrast(candidate, backgroundHex) >= ratio) return candidate;
  }
  // Ran out of lightness: drop chroma, which buys a little more headroom.
  for (let i = 1; i <= 8; i++) {
    const candidate = oklch(direction > 0 ? 0.99 : 0.02, base.C * (1 - i / 8), base.H);
    if (contrast(candidate, backgroundHex) >= ratio) return candidate;
  }
  return direction > 0 ? '#FFFFFF' : '#000000';
}

/** Shortest distance between two hues, in degrees (0-180). */
export function hueDistance(a, b) {
  const d = Math.abs(((a - b) % 360 + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** Mix two colours in OKLab, which avoids the muddy midpoint sRGB gives. */
export function mix(hexA, hexB, amount = 0.5) {
  const a = hexToOklch(hexA); const b = hexToOklch(hexB);
  if (!a || !b) return hexA;
  // Interpolate around the shorter arc so red→magenta does not detour via green.
  let dh = b.H - a.H;
  if (dh > 180) dh -= 360;
  if (dh < -180) dh += 360;
  return oklch(
    a.L + (b.L - a.L) * amount,
    a.C + (b.C - a.C) * amount,
    (a.H + dh * amount + 360) % 360,
  );
}

export const isAchromatic = (hex, threshold = 0.035) => {
  const c = hexToOklch(hex);
  return !c || c.C < threshold;
};
