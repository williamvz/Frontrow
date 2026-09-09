// Team names arrive spelled a dozen ways: "PSV Eindhoven", "PSV", "P.S.V.",
// "Go Ahead Eagles Deventer", "Sparta R.". Matching is done on a normalised
// form plus an explicit alias list per team, never on raw equality.

const STRIP_WORDS = new Set([
  'fc', 'sc', 'vv', 'bv', 'cv', 'afc', 'sbv', 'nec', 'rkc', 'nac', 'pec',
  'club', 'football', 'voetbal', 'combinatie', 'vereniging',
]);

// Letters that NFD does not decompose — they are separate code points, not
// base+diacritic — so they need an explicit mapping.
const TRANSLITERATE = { 'ø': 'o', 'æ': 'ae', 'œ': 'oe', 'ß': 'ss', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ł': 'l', 'ı': 'i' };

/** Lowercase, accent-free, punctuation-free, single-spaced. */
export function normalise(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[øæœßđðþłı]/g, (c) => TRANSLITERATE[c])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * A harsher key used only as a last-resort match: drops the generic club
 * words so "FC Utrecht" and "Utrecht" collapse onto each other. Kept separate
 * from normalise() because dropping them is lossy — "NEC" is *only* those.
 */
export function matchKey(name) {
  const words = normalise(name).split(' ').filter(Boolean);
  const kept = words.filter((w) => !STRIP_WORDS.has(w));
  return (kept.length ? kept : words).join(' ');
}

/** Deterministic short id — used to give events and matches stable primary keys. */
export function hashId(...parts) {
  const s = parts.map((p) => String(p ?? '')).join('|');
  // FNV-1a, 64-bit-ish via two 32-bit lanes. Stable across restarts and
  // platforms, which is the only property we need.
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ (c + i), 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).padStart(13, '0');
}

/** Turn any label into a url/id-safe slug. */
export const slugify = (s) => normalise(s).replace(/ /g, '-');
