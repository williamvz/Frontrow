// Just enough colour maths for the server: the crest fallback has to pick an
// ink that is actually readable on the club's own colour. The full OKLCH engine
// lives in the frontend, where the theme is built; this is the WCAG contrast
// formula and nothing else.

export function luminance(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return 0;
  const channels = [0, 2, 4].map((i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The ink for a monogram on `fill`. A club's second colour is used only when it
 * actually reads — NEC's green on NEC's red is a hue pairing, not a contrast
 * pairing — otherwise black or white, whichever wins.
 */
export function readableInk(fill, preferred) {
  if (preferred && contrast(preferred, fill) >= 4.5) return preferred;
  return contrast('#0A0A0B', fill) >= contrast('#FFFFFF', fill) ? '#0A0A0B' : '#FFFFFF';
}
