import { useEffect, useRef, useState } from 'react';

/**
 * One score digit-group.
 *
 * Two rules, both about not moving. The numerals are tabular AND each digit
 * sits in its own fixed 1ch grid cell — belt and braces, because a score going
 * 9 to 10 must not shift a pixel even if a future font subset were rebuilt
 * without tabular figures. The box also has a reserved minimum width.
 *
 * When the value changes the new number ticks up into place, which is how you
 * notice a goal in a list you were not looking at.
 */
export default function Score({ value, size = 28, dim = false, animate = true, weight }) {
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

  const digits = value == null ? [] : String(value).split('');

  return (
    <span
      className="num inline-grid overflow-hidden text-right"
      style={{
        gridAutoFlow: 'column',
        gridAutoColumns: '1ch',
        justifyContent: 'end',
        fontSize: size,
        lineHeight: 1,
        minWidth: '1ch',
        color: dim ? 'var(--text-2)' : 'var(--text-1)',
        fontVariationSettings: weight ? `'wght' ${weight}, 'wdth' 108` : undefined,
        transition: 'font-variation-settings 400ms var(--ease-wipe)',
      }}
    >
      {digits.map((d, i) => (
        <span key={i} className={ticking ? 'fr-tick block text-center' : 'block text-center'}>{d}</span>
      ))}
    </span>
  );
}
