import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import Crest from './Crest.jsx';
import ClubName from './ClubName.jsx';

/**
 * The league table — the screen most livescore apps get wrong.
 *
 * They get it wrong by treating it as a spreadsheet: eight columns of equal
 * weight, no sense of what the positions mean, and your own club invisible in
 * the middle. Here the zones are marked by a coloured edge on the position
 * cell, your club's row carries the club tint, and the form guide is five
 * squares rather than five letters, because shape reads faster than text.
 */
const ZONE_COLOR = {
  champion: 'var(--accent)',
  ucl: 'var(--info)',
  uel: 'var(--info)',
  uecl: 'var(--win)',
  playoff_europe: 'var(--win)',
  promotion: 'var(--win)',
  playoff_promotion: 'var(--warn)',
  playoff_relegation: 'var(--warn)',
  relegation: 'var(--loss)',
};

export default function LeagueTable({ rows }) {
  const { profile } = useStore();
  const { t } = useT();
  const favourite = profile?.favouriteTeamId;

  if (!rows?.length) {
    return (
      <p className="px-8 py-16 text-center" style={{ fontSize: 14, color: 'var(--text-4)' }}>
        {t('empty.noMatchesAtAll')}
      </p>
    );
  }

  const zones = [...new Set(rows.map((r) => r.zone).filter(Boolean))];

  return (
    <div>
      <div
        className="label sticky z-10 grid items-center px-3"
        style={{
          top: 'calc(var(--header-h) + var(--chrome-top) + 40px)',
          gridTemplateColumns: '24px 1fr 22px 22px 22px 30px 30px 62px',
          gap: 6, height: 26, fontSize: 9, color: 'var(--text-4)',
          background: 'var(--bg)', borderBottom: '1px solid var(--border)',
        }}
      >
        <span>{t('table.position')}</span>
        <span>{t('table.club')}</span>
        <span className="text-right">{t('table.played')}</span>
        <span className="text-right">{t('table.won')}</span>
        <span className="text-right">{t('table.lost')}</span>
        <span className="text-right">{t('table.goalDiff')}</span>
        <span className="text-right">{t('table.points')}</span>
        <span className="text-right">{t('table.form')}</span>
      </div>

      {rows.map((r) => {
        const mine = r.team.id === favourite;
        const moved = r.previousPosition != null && r.previousPosition !== r.position;
        return (
          <button
            key={r.team.id}
            type="button"
            onClick={() => navigate(`club/${r.team.id}`)}
            className="grid w-full items-center px-3 text-left"
            style={{
              gridTemplateColumns: '24px 1fr 22px 22px 22px 30px 30px 62px',
              gap: 6, height: 44,
              background: mine ? 'var(--accent-veil)' : 'var(--surface-1)',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span className="relative flex items-center gap-1.5">
              {r.zone && (
                <span
                  style={{
                    position: 'absolute', left: -12, width: 3, height: 44,
                    background: ZONE_COLOR[r.zone] || 'transparent',
                  }}
                  aria-hidden
                />
              )}
              <span className="num-soft" style={{ fontSize: 13, color: mine ? 'var(--text-1)' : 'var(--text-2)' }}>
                {r.position}
              </span>
              {moved && (
                <span
                  aria-hidden
                  style={{
                    fontSize: 8,
                    color: r.previousPosition > r.position ? 'var(--win)' : 'var(--loss)',
                  }}
                >
                  {r.previousPosition > r.position ? '▲' : '▼'}
                </span>
              )}
            </span>

            <span className="flex min-w-0 items-center gap-2">
              <Crest team={r.team} size={18} />
              <ClubName team={r.team} size={13} weight={mine ? 700 : 500} />
            </span>

            <Cell value={r.played} />
            <Cell value={r.won} />
            <Cell value={r.lost} />
            <Cell value={r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff} />
            <span className="num text-right" style={{ fontSize: 14 }}>{r.points}</span>

            <span className="flex justify-end gap-0.5">
              {(r.form || '').slice(-5).split('').map((c, i) => (
                <span
                  key={i}
                  title={c}
                  style={{
                    width: 9, height: 9,
                    background: c === 'W' ? 'var(--win)' : c === 'V' || c === 'L' ? 'var(--loss)' : 'var(--draw)',
                  }}
                  aria-hidden
                />
              ))}
            </span>
          </button>
        );
      })}

      {zones.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-4">
          {zones.map((z) => (
            <span key={z} className="flex items-center gap-2">
              <span style={{ width: 3, height: 12, background: ZONE_COLOR[z] }} aria-hidden />
              <span className="label" style={{ fontSize: 9, color: 'var(--text-4)' }}>{t(`table.zone.${z}`)}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const Cell = ({ value }) => (
  <span className="num-soft text-right" style={{ fontSize: 12, color: 'var(--text-2)' }}>{value}</span>
);
