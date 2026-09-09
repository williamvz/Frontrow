/**
 * Skeletons that match the real layout exactly.
 *
 * A generic grey blob is worse than a blank screen: it promises a shape and
 * then delivers a different one, and the jump on hydrate is what makes an app
 * feel cheap. These have the same 72px height and the same column grid as the
 * rows they stand in for, so content arrives without a single pixel moving.
 */
export function RowSkeleton({ count = 6 }) {
  return (
    <div aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className="hair grid items-center"
          style={{
            gridTemplateColumns: '3px 52px 1fr max-content 16px',
            height: 'var(--row-h)',
            background: 'var(--surface-1)',
            opacity: 1 - i * 0.1,
          }}
        >
          <span />
          <span className="mx-auto block h-3 w-8" style={{ background: 'var(--surface-3)' }} />
          <span className="flex flex-col gap-2 pl-1">
            <span className="block h-3 w-32" style={{ background: 'var(--surface-3)' }} />
            <span className="block h-3 w-24" style={{ background: 'var(--surface-2)' }} />
          </span>
          <span className="flex flex-col items-end gap-2">
            <span className="block h-4 w-3" style={{ background: 'var(--surface-3)' }} />
            <span className="block h-4 w-3" style={{ background: 'var(--surface-2)' }} />
          </span>
          <span />
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 120 }) {
  return <div aria-hidden style={{ height, background: 'var(--surface-1)' }} className="hair" />;
}
