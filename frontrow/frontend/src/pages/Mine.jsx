import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, TabBarSpacer } from '../components/Chrome.jsx';
import MatchRow from '../components/MatchRow.jsx';
import Crest from '../components/Crest.jsx';
import ClubName from '../components/ClubName.jsx';
import { RowSkeleton } from '../components/Skeleton.jsx';
import { weekdayDayMonth, localDate } from '../lib/format.js';

/**
 * Mijn clubs — one merged timeline across everything you follow, past and
 * future, with today's line in the middle. This is the screen for people who
 * follow three clubs and want one answer rather than three tabs.
 */
export default function Mine() {
  const { follows, teams, profile, flaring, actions } = useStore();
  const { t, locale } = useT();
  const [matches, setMatches] = useState(null);
  const [editing, setEditing] = useState(false);

  const followedTeams = useMemo(
    () => follows.filter((f) => f.kind === 'team').map((f) => teams[f.id]).filter(Boolean),
    [follows, teams],
  );

  useEffect(() => {
    setMatches(null);
    api.matches({ following: '1', limit: 200 })
      .then((d) => setMatches(d.matches))
      .catch(() => setMatches([]));
  }, [follows]);

  const grouped = useMemo(() => {
    if (!matches) return [];
    const out = [];
    for (const m of matches) {
      const date = localDate(m.kickoff);
      let bucket = out.at(-1);
      if (!bucket || bucket.date !== date) { bucket = { date, matches: [] }; out.push(bucket); }
      bucket.matches.push(m);
    }
    return out;
  }, [matches]);

  const today = localDate();
  const followedIds = new Set(followedTeams.map((x) => x.id));

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header
        title={t('follow.title')}
        subtitle={followedTeams.length ? followedTeams.map((x) => x.short).join(' · ') : undefined}
        right={(
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="label px-2"
            style={{ fontSize: 10, color: editing ? 'var(--accent)' : 'var(--text-2)' }}
          >
            {editing ? t('common.save') : t('follow.addTeam')}
          </button>
        )}
      />

      {editing && <TeamPicker />}

      {!editing && followedTeams.length > 0 && (
        <div className="rail flex gap-2 px-4 py-3" style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}>
          {followedTeams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => navigate(`club/${team.id}`)}
              className="flex shrink-0 items-center gap-2 px-3"
              style={{
                height: 34, background: 'var(--surface-2)',
                borderLeft: `3px solid ${team.id === profile?.favouriteTeamId ? 'var(--accent)' : 'transparent'}`,
              }}
            >
              <Crest team={team} size={18} />
              <ClubName team={team} size={13} weight={600} />
            </button>
          ))}
        </div>
      )}

      {!editing && !matches && <RowSkeleton count={6} />}

      {!editing && matches && matches.length === 0 && (
        <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
          <span className="label" style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('follow.empty')}</span>
          <p style={{ fontSize: 14, color: 'var(--text-4)', maxWidth: 280 }}>{t('follow.emptyHint')}</p>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="label mt-3 px-5"
            style={{ height: 40, fontSize: 11, background: 'var(--accent)', color: 'var(--on-accent)' }}
          >
            {t('follow.addTeam')}
          </button>
        </div>
      )}

      {!editing && grouped.map((bucket) => (
        <section key={bucket.date}>
          <div
            className="label flex items-center gap-3 px-4"
            style={{
              height: 30, fontSize: 10,
              color: bucket.date === today ? 'var(--accent)' : 'var(--text-3)',
              background: 'var(--bg)',
            }}
          >
            {weekdayDayMonth(`${bucket.date}T12:00:00Z`, locale)}
            <span className="h-px flex-1" style={{ background: 'var(--border)' }} aria-hidden />
          </div>
          {bucket.matches.map((m) => (
            <MatchRow
              key={m.id}
              match={m}
              followed={followedIds.has(m.home.id) || followedIds.has(m.away.id)}
              flaring={Boolean(flaring[m.id])}
              spoilerFree={Boolean(profile?.spoilerFree)}
              onOpen={(x) => navigate(`match/${x.id}`)}
            />
          ))}
        </section>
      ))}

      <TabBarSpacer />
    </main>
  );
}

/** Every club in the database, grouped so the Eredivisie is not buried. */
function TeamPicker() {
  const { teams, follows, actions, profile } = useStore();
  const { t } = useT();
  const [query, setQuery] = useState('');
  const followed = new Set(follows.filter((f) => f.kind === 'team').map((f) => f.id));

  const list = Object.values(teams)
    .filter((x) => !query || x.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, 'nl'));

  return (
    <div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('common.search')}
        className="w-full px-4"
        style={{
          height: 44, background: 'var(--surface-2)', color: 'var(--text-1)',
          border: 'none', borderBottom: '1px solid var(--border)', fontSize: 15, outline: 'none',
        }}
      />
      {list.map((team) => {
        const on = followed.has(team.id);
        const fav = team.id === profile?.favouriteTeamId;
        return (
          <div
            key={team.id}
            className="hair flex items-center gap-3 px-4"
            style={{ height: 48, background: 'var(--surface-1)' }}
          >
            <Crest team={team} size={20} />
            <span className="min-w-0 flex-1"><ClubName team={team} size={14} /></span>
            {!fav && (
              <button
                type="button"
                onClick={() => actions.patchProfile({ favouriteTeamId: team.id })}
                className="label px-2"
                style={{ fontSize: 9, color: 'var(--text-4)' }}
              >
                {t('team.setFavourite')}
              </button>
            )}
            {fav && (
              <span className="label px-2" style={{ fontSize: 9, color: 'var(--accent)' }}>
                {t('team.isFavourite')}
              </span>
            )}
            <button
              type="button"
              onClick={() => actions.toggleFollow('team', team.id)}
              className="label px-3"
              style={{
                height: 30, fontSize: 10,
                background: on ? 'var(--accent)' : 'var(--surface-3)',
                color: on ? 'var(--on-accent)' : 'var(--text-2)',
              }}
              aria-pressed={on}
            >
              {on ? t('team.following') : t('team.follow')}
            </button>
          </div>
        );
      })}
    </div>
  );
}
