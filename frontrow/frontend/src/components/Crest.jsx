import { useState } from 'react';
import { initials } from '../lib/format.js';
import { contrast } from '../theme/color.js';

/**
 * The monogram's ink is chosen by contrast, never by convention. NEC's second
 * colour is green and their first is red: putting one on the other is
 * unreadable, so the fallback is whichever of black or white actually works.
 */
function inkFor(fill, preferred) {
  if (preferred && contrast(preferred, fill) >= 4.5) return preferred;
  return contrast('#0A0A0B', fill) >= contrast('#FFFFFF', fill) ? '#0A0A0B' : '#FFFFFF';
}

/**
 * A club crest.
 *
 * The image is served by our own backend, never by ESPN's CDN: Frontrow makes
 * no third-party requests from the browser, and a crest cached on the Pi also
 * survives the provider changing its URL scheme.
 *
 * When there is no crest — an amateur side in the cup, a club the provider has
 * never heard of — the fallback is a monogram in the club's own colours. It is
 * the same size and the same shape, so a missing crest never moves a pixel.
 */
export default function Crest({ team, size = 20, className = '' }) {
  const [failed, setFailed] = useState(false);
  if (!team) return <span style={{ width: size, height: size }} className={className} aria-hidden />;

  const box = { width: size, height: size };

  if (failed || !team.id) {
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center ${className}`}
        style={{
          ...box,
          background: team.color || '#2C231E',
          color: inkFor(team.color || '#2C231E', team.color2),
          fontSize: Math.round(size * 0.42),
          fontVariationSettings: "'wght' 800, 'wdth' 78",
          letterSpacing: '0.02em',
        }}
        aria-hidden
      >
        {initials(team.short || team.name)}
      </span>
    );
  }

  return (
    <img
      src={`api/crest/${encodeURIComponent(team.id)}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${className}`}
      style={box}
    />
  );
}
