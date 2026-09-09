import { useT } from '../i18n/index.jsx';

/**
 * Line-ups on a pitch.
 *
 * The formation string is the only positional data a free provider gives us, so
 * the pitch is drawn from it: "4-2-3-1" becomes four rows of shirt tokens laid
 * out across the width. That is honest — it is a formation diagram, not a
 * heat map pretending to be tracking data — and it is the thing people actually
 * look for an hour before kick-off.
 */
export default function LineupPitch({ match, lineups }) {
  const { t } = useT();
  const home = lineups.find((l) => l.side === 'home');
  const away = lineups.find((l) => l.side === 'away');

  if (!home?.players.length && !away?.players.length) {
    return (
      <div className="px-8 py-16 text-center" style={{ background: 'var(--surface-1)' }}>
        <span style={{ fontSize: 14, color: 'var(--text-4)' }}>{t('match.noLineups')}</span>
      </div>
    );
  }

  return (
    <section style={{ background: 'var(--surface-1)' }}>
      <Pitch home={home} away={away} match={match} />
      <Bench lineup={home} team={match.home} />
      <Bench lineup={away} team={match.away} />
    </section>
  );
}

function Pitch({ home, away, match }) {
  const { t } = useT();
  return (
    <div className="relative px-3 py-4">
      <div className="mb-3 flex items-center justify-between">
        <Side team={match.home} lineup={home} colorVar="--accent" />
        <Side team={match.away} lineup={away} colorVar="--accent-2" align="right" />
      </div>

      <div
        className="relative w-full"
        style={{ aspectRatio: '68 / 105', background: 'var(--bg)', border: '1px solid var(--border)' }}
      >
        {/* the pitch markings, at the same weight as every other hairline */}
        <svg
          viewBox="0 0 68 105" className="absolute inset-0 h-full w-full" preserveAspectRatio="none" aria-hidden
        >
          <g stroke="var(--border)" strokeWidth="0.4" fill="none">
            <line x1="0" y1="52.5" x2="68" y2="52.5" />
            <circle cx="34" cy="52.5" r="9.15" />
            <rect x="13.85" y="0" width="40.3" height="16.5" />
            <rect x="24.85" y="0" width="18.3" height="5.5" />
            <rect x="13.85" y="88.5" width="40.3" height="16.5" />
            <rect x="24.85" y="99.5" width="18.3" height="5.5" />
          </g>
        </svg>

        {home?.players.length > 0 && (
          <Formation lineup={home} colorVar="--accent" from="top" />
        )}
        {away?.players.length > 0 && (
          <Formation lineup={away} colorVar="--accent-2" from="bottom" />
        )}
      </div>

      <p className="mt-3 text-center" style={{ fontSize: 11, color: 'var(--text-4)' }}>
        {t('match.formation')}: {home?.formation || '—'} · {away?.formation || '—'}
      </p>
    </div>
  );
}

function Side({ team, lineup, colorVar, align }) {
  const { t } = useT();
  return (
    <div className={align === 'right' ? 'text-right' : ''}>
      <div className="flex items-center gap-2" style={{ flexDirection: align === 'right' ? 'row-reverse' : 'row' }}>
        <span style={{ width: 10, height: 10, background: `var(${colorVar})` }} aria-hidden />
        <span className="label" style={{ fontSize: 11, color: 'var(--text-1)' }}>{team.short}</span>
      </div>
      {lineup?.coach && (
        <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
          {t('match.coach')}: {lineup.coach}
        </span>
      )}
    </div>
  );
}

/** Turn "4-2-3-1" into rows of tokens; a keeper is always the first row. */
function Formation({ lineup, colorVar, from }) {
  const starters = lineup.players.filter((p) => p.starter);
  const keeper = starters.find((p) => p.position === 'GK') || starters[0];
  const outfield = starters.filter((p) => p !== keeper);

  const shape = (lineup.formation || '4-3-3').split('-').map(Number).filter(Boolean);
  const rows = [];
  let i = 0;
  for (const count of shape) {
    rows.push(outfield.slice(i, i + count));
    i += count;
  }
  if (i < outfield.length) rows.push(outfield.slice(i));

  const bands = [[keeper], ...rows].filter((r) => r.length);
  const depth = bands.length;

  return (
    <>
      {bands.map((band, bandIndex) => {
        const t = (bandIndex + 0.65) / (depth + 0.3);
        const y = from === 'top' ? t * 48 : 100 - t * 48;
        return band.map((player, playerIndex) => {
          const x = ((playerIndex + 1) / (band.length + 1)) * 100;
          return (
            <Token
              key={`${player?.name}-${playerIndex}`}
              player={player}
              colorVar={colorVar}
              style={{ left: `${x}%`, top: `${y}%` }}
            />
          );
        });
      })}
    </>
  );
}

function Token({ player, colorVar, style }) {
  if (!player) return null;
  return (
    <span
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={style}
    >
      <span
        className="num flex items-center justify-center"
        style={{
          width: 22, height: 22, fontSize: 11,
          background: `var(${colorVar})`, color: 'var(--bg)',
        }}
      >
        {player.shirt ?? ''}
      </span>
      <span
        className="whitespace-nowrap"
        style={{
          fontSize: 9, color: 'var(--text-2)',
          fontVariationSettings: "'wght' 600, 'wdth' 80",
          textShadow: '0 1px 2px var(--bg)',
        }}
      >
        {lastName(player.name)}
      </span>
    </span>
  );
}

const lastName = (n) => String(n || '').split(' ').slice(-1)[0];

function Bench({ lineup, team }) {
  const { t } = useT();
  const subs = lineup?.players.filter((p) => !p.starter) || [];
  if (!subs.length) return null;
  return (
    <div className="hair px-4 py-3">
      <div className="label mb-2" style={{ fontSize: 10, color: 'var(--text-3)' }}>
        {t('match.bench')} · {team.short}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {subs.map((p) => (
          <span key={p.name} className="flex items-center gap-1.5" style={{ fontSize: 12, color: 'var(--text-2)' }}>
            <span className="num-soft" style={{ fontSize: 11, color: 'var(--text-4)', minWidth: 14 }}>
              {p.shirt ?? ''}
            </span>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}
