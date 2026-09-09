/**
 * A club name that is never truncated.
 *
 * "Go Ahead Eagles" does not fit where "Ajax" does, and an ellipsis in a
 * football app is unforgivable — half a club's name is worse than none. Archivo
 * has a width axis, so instead of cutting the name we narrow the type. At
 * wdth 78 it is still comfortably readable at 15px and the longest name in
 * Dutch football fits a 390px row in full.
 */
const widthFor = (name) => {
  const n = (name || '').length;
  // Narrowing stops at 82: below that Archivo gets thin in a dim room. The
  // curated short name in the database is the floor under this rule, and
  // truncation is never an option.
  if (n > 19) return 82;
  if (n > 14) return 88;
  return 100;
};

export default function ClubName({
  team, weight = 500, dim = false, size = 15, className = '',
}) {
  const name = team?.short || team?.name || '';
  return (
    <span
      className={`name block whitespace-nowrap ${className}`}
      style={{
        '--name-wdth': widthFor(name),
        '--name-wght': weight,
        fontSize: size,
        color: dim ? 'var(--text-2)' : 'var(--text-1)',
      }}
    >
      {name}
    </span>
  );
}
