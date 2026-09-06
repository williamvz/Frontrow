import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, ConnectionRule, DateRibbon, TabBarSpacer } from '../components/Chrome.jsx';
import MatchRow from '../components/MatchRow.jsx';
import { RowSkeleton } from '../components/Skeleton.jsx';
import FollowedBlock from '../components/FollowedBlock.jsx';
import { weekdayDayMonth, relativeDay, localDate } from '../lib/format.js';

/**
 * The home screen — a rundown, not a feed.
 *
 * Sections butt directly against each other with no gaps and no margins, so a
 * 844px phone shows seven full match rows where a card layout would show four.
 * That density is the whole point: this screen exists to answer one question in
 * three seconds.
 */
export default function Today() {
  const { date, day, dayLoading, follows, flaring, profile, favourite } = useStore();
  const { t, locale } = useT();

  const followedTeams = useMemo(
    () => new Set(follows.filter((f) => f.kind === 'team').map((f) => f.id)),
    [follows],
  );

  const relative = relativeDay(date, t);
  const subtitle = relative
    ? `${relative} · ${weekdayDayMonth(`${date}T12:00:00Z`, locale)}`
    : weekdayDayMonth(`${date}T12:00:00Z`, locale);

  const groups = day?.groups || [];
  const liveCount = groups.reduce(
    (n, g) => n + g.matches.filter((m) => ['live', 'halftime'].includes(m.status)).length, 0,
  );

  const featured = useMemo(() => {
    if (!favourite) return null;
    for (const g of groups) {
      const hit = g.matches.find((m) => m.home.id === favourite.id || m.away.id === favourite.id);
      if (hit) return { match: hit, competition: g.competition };
    }
    return null;
  }, [groups, favourite]);

  return (
    <main style={{ background: 'var(--bg)', minHeight: '100dvh' }}>
      <Header
        title={t('app.name')}
        subtitle={subtitle}
        right={(
          <button
            type="button"
            onClick={() => navigate('meer')}
            className="flex h-11 w-11 items-center justify-center"
            style={{ color: 'var(--text-2)' }}
            aria-label={t('settings.title')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
              <rect x="14" y="4" width="3" height="6" fill="currentColor" />
              <rect x="8" y="14" width="3" height="6" fill="currentColor" />
            </svg>
          </button>
        )}
      />
      <ConnectionRule />
      <DateRibbon />

      {featured && <FollowedBlock match={featured.match} competition={featured.competition} />}

      {dayLoading && !day && <RowSkeleton count={7} />}

      {!dayLoading && groups.length === 0 && <EmptyToday date={date} />}

      {groups.map((group) => (
        <section key={group.competition.id}>
          <SectionHeader
            group={group}
            live={group.matches.filter((m) => ['live', 'halftime'].includes(m.status)).length}
          />
          {group.matches
            .filter((m) => !featured || m.id !== featured.match.id)
            .map((match) => (
              <MatchRow
                key={match.id}
                match={match}
                followed={followedTeams.has(match.home.id) || followedTeams.has(match.away.id)}
                flaring={Boolean(flaring[match.id])}
                spoilerFree={Boolean(profile?.spoilerFree)}
                onOpen={(m) => navigate(`match/${m.id}`)}
              />
            ))}
        </section>
      ))}

      {groups.length > 0 && <Tail liveCount={liveCount} />}
      <TabBarSpacer />
    </main>
  );
}

/** A rundown divider: the name, a rule to the edge, the round on the right. */
function SectionHeader({ group, live }) {
  return (
    <div
      className="sticky z-10 flex items-center gap-3"
      style={{
        top: 'calc(var(--header-h) + var(--ribbon-h) + var(--chrome-top))',
        height: 32,
        paddingInline: 16,
        background: 'var(--bg)',
      }}
    >
      <button
        type="button"
        onClick={() => navigate(`competitie/${group.competition.id}`)}
        className="label shrink-0"
        style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-2)' }}
      >
        {group.competition.name}
      </button>
      <span className="h-px flex-1" style={{ background: 'var(--border)' }} aria-hidden />
      {live > 0 && (
        <span
          className="num flex items-center justify-center"
          style={{ minWidth: 18, height: 14, fontSize: 10, background: 'var(--text-1)', color: 'var(--bg)' }}
        >
          {live}
        </span>
      )}
      {group.matches[0]?.round && (
        <span className="label shrink-0" style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {group.matches[0].round}
        </span>
      )}
    </div>
  );
}

function EmptyToday({ date }) {
  const { t } = useT();
  const isToday = date === localDate();
  return (
    <div className="flex flex-col items-center gap-2 px-8 py-20 text-center">
      <span
        className="label"
        style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.14em' }}
      >
        {isToday ? t('empty.noMatchesToday') : t('status.scheduled')}
      </span>
      <p style={{ fontSize: 14, color: 'var(--text-4)', maxWidth: 260 }}>
        {t('empty.noMatchesAtAllHint')}
      </p>
    </div>
  );
}

function Tail({ liveCount }) {
  const { lastSyncAt } = useStore();
  const { t } = useT();
  if (!lastSyncAt) return <div style={{ height: 32 }} />;
  const clock = new Date(lastSyncAt).toLocaleTimeString('nl-NL', {
    timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return (
    <div
      className="label flex items-center justify-center"
      style={{ height: 32, fontSize: 10, color: 'var(--text-4)' }}
    >
      {t('common.updated')} {clock}
      {liveCount > 0 && ` · ${liveCount} ${t('common.live').toLowerCase()}`}
    </div>
  );
}
