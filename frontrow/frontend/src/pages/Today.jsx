import { useMemo } from 'react';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, ConnectionRule, DateRibbon, TabBarSpacer } from '../components/Chrome.jsx';
import MatchRow from '../components/MatchRow.jsx';
import { RowSkeleton } from '../components/Skeleton.jsx';
import FollowedBlock from '../components/FollowedBlock.jsx';
import NextUp from '../components/NextUp.jsx';
import { weekdayDayMonth, relativeDay } from '../lib/format.js';

/**
 * Drama, for sorting the NU band. A one-goal game in the 88th minute is the
 * most interesting thing on the screen and should not be third in a list
 * because its competition sorts lower.
 */
function drama(m) {
  const minute = m.minute ?? 0;
  const diff = Math.abs((m.score.home ?? 0) - (m.score.away ?? 0));
  let score = minute;                       // later is tenser
  if (diff <= 1) score += 60;               // one goal in it
  if (diff === 0) score += 15;              // level
  if (minute >= 80) score += 40;            // the closing stretch
  if (m.status === 'halftime') score -= 30; // nothing is happening right now
  return score;
}

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

  const allGroups = day?.groups || [];
  const liveMatches = allGroups
    .flatMap((g) => g.matches.map((m) => ({ ...m, _competition: g.competition })))
    .filter((m) => ['live', 'halftime'].includes(m.status))
    .sort((a, b) => drama(b) - drama(a));
  const liveCount = liveMatches.length;
  const liveIds = new Set(liveMatches.map((m) => m.id));

  // Anything in play is pulled out into the NU band above the fold, so it never
  // has to be hunted for inside a competition section.
  const groups = allGroups
    .map((g) => ({ ...g, matches: g.matches.filter((m) => !liveIds.has(m.id)) }))
    .filter((g) => g.matches.length);

  const matchCount = allGroups.reduce((n, g) => n + g.matches.length, 0);

  const relative = relativeDay(date, t);
  // The header answers "what is on today" rather than repeating the date the
  // ribbon already shows: how many matches, and how many are in play.
  const parts = [relative || weekdayDayMonth(`${date}T12:00:00Z`, locale)];
  if (matchCount) {
    parts.push(t(matchCount === 1 ? 'today.summaryMatches' : 'today.summaryMatchesPlural', { n: matchCount }));
  }
  if (liveCount) parts.push(t('today.summaryLive', { n: liveCount }));
  const subtitle = parts.join(' · ');

  // Computed from ALL groups, not the ones left after the NU band took the live
  // matches out — otherwise your club's block disappears at exactly the moment
  // your club kicks off.
  const featured = useMemo(() => {
    if (!favourite) return null;
    for (const g of allGroups) {
      const hit = g.matches.find((m) => m.home.id === favourite.id || m.away.id === favourite.id);
      if (hit) return { match: hit, competition: g.competition };
    }
    return null;
  }, [allGroups, favourite]);

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

      {liveMatches.length > 0 && (
        <section>
          <NowHeader count={liveMatches.length} />
          {liveMatches
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
      )}

      {!dayLoading && day && matchCount === 0 && <NextUp date={date} />}

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

      {matchCount > 0 && <Tail liveCount={liveCount} />}
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

/** The NU band's own divider — white, because live is achromatic here. */
function NowHeader({ count }) {
  const { t } = useT();
  return (
    <div
      className="sticky z-10 flex items-center gap-3 px-4"
      style={{
        top: 'calc(var(--header-h) + var(--ribbon-h) + var(--chrome-top))',
        height: 32, background: 'var(--bg)',
      }}
    >
      <span className="label" style={{ fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-1)' }}>
        {t('today.now')}
      </span>
      <span className="h-px flex-1" style={{ background: 'var(--text-4)' }} aria-hidden />
      <span
        className="num flex items-center justify-center"
        style={{ minWidth: 18, height: 14, fontSize: 10, background: 'var(--text-1)', color: 'var(--bg)' }}
      >
        {count}
      </span>
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
  // The space an ad banner would have occupied, used to say the one thing that
  // is true about this app and false about every alternative.
  return (
    <div className="flex flex-col items-center justify-end gap-1" style={{ height: 92, paddingBottom: 12 }}>
      <span className="label" style={{ fontSize: 10, color: 'var(--text-4)' }}>
        {t('common.updated')} {clock}
        {liveCount > 0 && ` · ${liveCount} ${t('common.live').toLowerCase()}`}
      </span>
      <span className="label" style={{ fontSize: 10, color: 'var(--text-4)', opacity: 0.7 }}>
        {t('today.manifesto')}
      </span>
    </div>
  );
}
