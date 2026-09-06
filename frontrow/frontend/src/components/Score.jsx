import { useEffect, useRef, useState } from 'react';

/**
 * One score digit-group.
 *
 * Two rules, both about not moving: the numerals are tabular, and the box has a
 * reserved minimum width. A score going 9 to 10, or 0 to 1, must not shift a
 * single pixel of the row — that reflow is the cheapest-feeling failure a
 * live-score app can have.
 *
 * When the value changes the new number ticks up into place, which is how you
 * notice a goal in a list you were not looking at.
 */
export default function Score({ value, size = 28, dim = false, animate = true }) {
  const [ticking, setTicking] = useState(false);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current !== value && previous.current != null && value != null && animate) {
      setTicking(true);
      const timer = setTimeout(() => setTicking(false), 400);
      previous.current = value;
      return () => clearTimeout(timer);
    }
    previous.current = value;
    return undefined;
  }, [value, animate]);

  return (
    <span
      className="num inline-block overflow-hidden text-right tabular-nums"
      style={{
        fontSize: size,
        lineHeight: 1,
        minWidth: size * 0.66,
        color: dim ? 'var(--text-2)' : 'var(--text-1)',
      }}
    >
      <span className={ticking ? 'fr-tick block' : 'block'}>
        {value == null ? '' : value}
      </span>
    </span>
  );
}
