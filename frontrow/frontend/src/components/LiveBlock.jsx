/**
 * The live minute, as a broadcast bug.
 *
 * A white block with black numerals, pulsing slowly. It is deliberately NOT
 * club-coloured: an Ajax supporter must be able to tell "my club" from "this is
 * live" at a glance, and both of those are red. Making liveness the one
 * achromatic signal in the app solves that for all 39 clubs at once.
 *
 * At half-time the block stops pulsing. That distinction does real work — a
 * pulse means the clock is running.
 */
export default function LiveBlock({ minute, minuteDisplay, halftime = false, label }) {
  const text = halftime ? (label || 'RUST') : (minuteDisplay || (minute != null ? `${minute}'` : ''));
  const wide = String(text).length > 4;

  return (
    <span
      className={`inline-flex items-center justify-center ${halftime ? '' : 'fr-pulse'}`}
      style={{
        minWidth: wide ? 48 : 40,
        height: 20,
        padding: '0 4px',
        background: 'var(--text-1)',
        color: 'var(--bg)',
      }}
    >
      <span
        className={halftime ? 'label' : 'num'}
        style={{ fontSize: halftime ? 10 : 13, lineHeight: 1 }}
      >
        {text}
      </span>
    </span>
  );
}
