import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, TabBarSpacer } from '../components/Chrome.jsx';
import MatchRow from '../components/MatchRow.jsx';
import Crest from '../components/Crest.jsx';
import { BlockSkeleton, RowSkeleton } from '../components/Skeleton.jsx';

export default function Team({ id }) {
  const { follows, profile, actions, flaring } = useStore();
  const { t } = useT();
  const [data, setData] = useState(null);

  useEffect(() => {
    setData(null);
    api.team(id).then(setData).catch(() => setData({ error: true }));
  }, [id]);

  if (!data) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Header title="…" onBack={() => window.history.back()} />
        <BlockSkeleton height={140} />
        <RowSkeleton count={5} />
      </main>
    );
  }
  if (data.error) return <main><Header title="—" onBack={() => window.history.back()} /></main>;

  const { team } = data;
  const following = follows.some((f) => f.kind === 'team' && f.id === id);
  const isFavourite = profile?.favouriteTeamId === id;

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header title={team.name} subtitle={team.city} onBack={() => window.history.back()} />

      <section
        className="relative flex items-center gap-4 px-4 py-5"
        style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
      >
        <span
          className="absolute left-0 top-0"
          style={{ width: 3, height: '100%', background: isFavourite ? 'var(--accent)' : team.color }}
          aria-hidden
        />
        <Crest team={team} size={56} />
        <div className="min-w-0 flex-1">
          <div style={{ fontSize: 20, color: 'var(--text-1)', fontVariationSettings: "'wght' 700, 'wdth' 92" }}>
            {team.name}
          </div>
          <div className="label" style={{ fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>
            {[team.stadium, team.founded].filter(Boolean).join(' · ')}
          </div>
          {data.standing && (
            <button
              type="button"
              onClick={() => navigate(`competitie/${data.standing.competitionId}`)}
              className="mt-2 flex items-center gap-2"
            >
              <span className="num" style={{ fontSize: 15, color: 'var(--accent)' }}>
                {data.standing.position}e
              </span>
              <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {data.standing.competitionName} · {data.standing.points} {t('table.points')}
              </span>
            </button>
          )}
        </div>
      </section>

      <div className="flex gap-px" style={{ background: 'var(--border)' }}>
        <button
          type="button"
          onClick={() => actions.toggleFollow('team', id)}
          className="label flex-1"
          style={{
            height: 44, fontSize: 11,
            background: following ? 'var(--accent)' : 'var(--surface-2)',
            color: following ? 'var(--on-accent)' : 'var(--text-1)',
          }}
          aria-pressed={following}
        >
          {following ? t('team.following') : t('team.follow')}
        </button>
        {!isFavourite && (
          <button
            type="button"
            onClick={() => actions.patchProfile({ favouriteTeamId: id })}
            className="label flex-1"
            style={{ height: 44, fontSize: 11, background: 'var(--surface-2)', color: 'var(--text-1)' }}
          >
            {t('team.setFavourite')}
          </button>
        )}
      </div>

      {data.form.length > 0 && (
        <section className="px-4 py-4" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
          <div className="label mb-2" style={{ fontSize: 10, color: 'var(--text-3)' }}>{t('team.form')}</div>
          <div className="flex gap-1">
            {data.form.map((f) => (
              <button
                key={f.matchId}
                type="button"
                onClick={() => navigate(`match/${f.matchId}`)}
                title={`${f.home ? '' : '@'}${f.opponent} ${f.score}`}
                className="num flex items-center justify-center"
                style={{
                  width: 26, height: 26, fontSize: 11,
                  background: f.result === 'W' ? 'var(--win)' : f.result === 'L' ? 'var(--loss)' : 'var(--draw)',
                  color: 'var(--bg)',
                }}
              >
                {f.result}
              </button>
            ))}
          </div>
        </section>
      )}

      {data.fixtures.length > 0 && (
        <>
          <SectionLabel>{t('team.fixtures')}</SectionLabel>
          {data.fixtures.map((m) => (
            <MatchRow key={m.id} match={m} followed flaring={Boolean(flaring[m.id])}
              spoilerFree={Boolean(profile?.spoilerFree)} onOpen={(x) => navigate(`match/${x.id}`)} />
          ))}
        </>
      )}

      {data.results.length > 0 && (
        <>
          <SectionLabel>{t('team.results')}</SectionLabel>
          {data.results.map((m) => (
            <MatchRow key={m.id} match={m} followed
              spoilerFree={Boolean(profile?.spoilerFree)} onOpen={(x) => navigate(`match/${x.id}`)} />
          ))}
        </>
      )}

      {data.topScorers.length > 0 && (
        <>
          <SectionLabel>{t('team.squadScorers')}</SectionLabel>
          {data.topScorers.map((s) => (
            <div key={s.player} className="hair flex items-center px-4" style={{ height: 42, background: 'var(--surface-1)' }}>
              <span className="min-w-0 flex-1 truncate" style={{ fontSize: 14, color: 'var(--text-1)' }}>{s.player}</span>
              <span className="num" style={{ fontSize: 15 }}>{s.goals}</span>
            </div>
          ))}
        </>
      )}

      <TabBarSpacer />
    </main>
  );
}

const SectionLabel = ({ children }) => (
  <div className="label flex items-center gap-3 px-4" style={{ height: 32, fontSize: 10, color: 'var(--text-3)' }}>
    {children}
    <span className="h-px flex-1" style={{ background: 'var(--border)' }} aria-hidden />
  </div>
);
