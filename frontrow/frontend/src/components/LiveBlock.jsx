/**
 * The live minute, as a broadcast bug.
 *
 * A white block with black numerals, pulsing slowly. It is deliberately NOT
 * club-coloured: an Ajax supporter must be able to tell "my club" from "this is
 * live" at a glance, and both of those are red. Making liveness the one
 * achromatic signal in the app solves that for all thirty-nine clubs at once.
 *
 * Half-time speaks on two channels at once — the block stops pulsing AND drops
 * to a dimmer ground — so "paused" is legible in peripheral vision rather than
 * only on close reading.
 *
 * Stoppage time splits the colour: the 90 stays black, the +4 goes amber. It
 * parses instantly, and the fixed-width block means it costs no layout.
 */
export default function LiveBlock({ minute, minuteDisplay, halftime = false, label, compact = false }) {
  if (halftime) {
    return (
      <span
        className="inline-flex items-center justify-center"
        style={{
          minWidth: compact ? 34 : 40, height: 20, padding: '0 4px',
          background: 'var(--text-3)', color: 'var(--bg)',
        }}
      >
        <span className="label" style={{ fontSize: 10, lineHeight: 1 }}>{label || 'RUST'}</span>
      </span>
    );
  }

  const text = minuteDisplay || (minute != null ? `${minute}'` : '');
  const [, base, extra] = /^(\d+)\+(\d+)/.exec(text) || [];

  return (
    <span
      className="fr-pulse inline-flex items-center justify-center"
      style={{
        minWidth: extra ? 48 : compact ? 34 : 40, height: 20, padding: '0 4px',
        background: 'var(--text-1)', color: 'var(--bg)',
      }}
    >
      <span className="num" style={{ fontSize: 13, lineHeight: 1 }}>
        {extra ? (
          <>
            {base}
            <span style={{ color: 'var(--warn)' }}>+{extra}</span>
            <span>&#39;</span>
          </>
        ) : text}
      </span>
    </span>
  );
}
