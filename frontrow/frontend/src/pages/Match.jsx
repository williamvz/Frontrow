import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { Header, TabBarSpacer } from '../components/Chrome.jsx';
import Crest from '../components/Crest.jsx';
import ClubName from '../components/ClubName.jsx';
import Score from '../components/Score.jsx';
import LiveBlock from '../components/LiveBlock.jsx';
import { BlockSkeleton } from '../components/Skeleton.jsx';
import Timeline from '../components/Timeline.jsx';
import StatBars from '../components/StatBars.jsx';
import LineupPitch from '../components/LineupPitch.jsx';
import { time, weekdayDayMonth } from '../lib/format.js';

const TABS = ['timeline', 'lineups', 'stats', 'h2h'];

export default function Match({ id }) {
  const { t, locale } = useT();
  const { lastEventAt } = useStore();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('timeline');
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.match(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [id, lastEventAt]);

  if (error) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Header title={t('common.back')} onBack={() => window.history.back()} />
        <p className="px-4 py-8" style={{ color: 'var(--text-3)' }}>{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
        <Header title="…" onBack={() => window.history.back()} />
        <BlockSkeleton height={180} />
      </main>
    );
  }

  const m = data.match;
  const available = TABS.filter((x) => {
    if (x === 'lineups') return data.lineups.some((l) => l.players.length);
    if (x === 'stats') return data.stats.length > 0;
    if (x === 'h2h') return data.head2head.length > 0;
    return true;
  });

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--bg)' }}>
      <Header
        title={m.competition.name}
        subtitle={`${weekdayDayMonth(m.kickoff, locale)} · ${time(m.kickoff, locale)}${m.round ? ` · ${m.round}` : ''}`}
        onBack={() => window.history.back()}
      />

      <MatchHero match={m} />

      <nav
        className="rail sticky z-20 flex"
        style={{
          top: 'calc(var(--header-h) + var(--chrome-top))',
          background: 'var(--bg)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {available.map((x) => (
          <button
            key={x}
            type="button"
            onClick={() => setTab(x)}
            className="label relative shrink-0 px-4"
            style={{
              height: 40, fontSize: 11,
              color: tab === x ? 'var(--text-1)' : 'var(--text-3)',
            }}
            aria-current={tab === x ? 'true' : undefined}
          >
            {t(`match.${x === 'timeline' ? 'timeline' : x === 'lineups' ? 'lineups' : x === 'stats' ? 'stats' : 'h2h'}`)}
            {tab === x && (
              <span
                style={{ position: 'absolute', left: 8, right: 8, bottom: -1, height: 3, background: 'var(--accent)' }}
                aria-hidden
              />
            )}
          </button>
        ))}
      </nav>

      {tab === 'timeline' && <Timeline match={m} events={data.events} />}
      {tab === 'lineups' && <LineupPitch match={m} lineups={data.lineups} />}
      {tab === 'stats' && <StatBars match={m} stats={data.stats} />}
      {tab === 'h2h' && <HeadToHead matches={data.head2head} />}

      <MatchInfo match={m} />
      <TabBarSpacer />
    </main>
  );
}

/** The hero: crests, the scoreline with a broadcast separator bar, the state. */
function MatchHero({ match }) {
  const { t, locale } = useT();
  const played = ['live', 'halftime', 'finished'].includes(match.status);
  return (
    <section
      className="relative px-4 py-6"
      style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
    >
      <span
        className="absolute left-0 top-0"
        style={{ width: 3, height: '100%', background: 'var(--accent)' }}
        aria-hidden
      />
      <div className="flex items-center justify-center gap-4">
        <Team team={match.home} align="right" />
        <div className="flex shrink-0 items-center gap-4">
          {played ? (
            <>
              <Score value={match.score.home} size={56} />
              <span style={{ width: 2, height: 28, background: 'var(--border-strong)' }} aria-hidden />
              <Score value={match.score.away} size={56} />
            </>
          ) : (
            <span className="num" style={{ fontSize: 40, color: 'var(--text-2)' }}>
              {time(match.kickoff, locale)}
            </span>
          )}
        </div>
        <Team team={match.away} align="left" />
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        {match.status === 'live' && <LiveBlock minute={match.minute} minuteDisplay={match.minuteDisplay} />}
        {match.status === 'halftime' && <LiveBlock halftime label={t('status.ht')} />}
        {match.status === 'finished' && (
          <span className="label" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {match.score.penalties ? t('status.pensLong') : t('status.ftLong')}
          </span>
        )}
        {match.score.halftime && (
          <span className="num-soft" style={{ fontSize: 12, color: 'var(--text-4)' }}>
            ({match.score.halftime.home}–{match.score.halftime.away})
          </span>
        )}
        {match.score.penalties && (
          <span className="num-soft" style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {t('status.pens')} {match.score.penalties.home}–{match.score.penalties.away}
          </span>
        )}
      </div>
    </section>
  );
}

function Team({ team, align }) {
  return (
    <button
      type="button"
      onClick={() => navigate(`club/${team.id}`)}
      className={`flex min-w-0 flex-1 flex-col gap-2 ${align === 'right' ? 'items-end text-right' : 'items-start text-left'}`}
    >
      <Crest team={team} size={44} />
      <ClubName team={team} size={15} weight={600} />
    </button>
  );
}

function HeadToHead({ matches }) {
  const { locale } = useT();
  return (
    <div>
      {matches.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => navigate(`match/${m.id}`)}
          className="hair flex w-full items-center gap-3 px-4 text-left"
          style={{ height: 52, background: 'var(--surface-1)' }}
        >
          <span className="label shrink-0" style={{ fontSize: 10, color: 'var(--text-4)', width: 56 }}>
            {new Date(m.kickoff).toLocaleDateString(locale === 'nl' ? 'nl-NL' : 'en-GB', { month: 'short', year: '2-digit' })}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Crest team={m.home} size={16} />
            <ClubName team={m.home} size={13} />
          </span>
          <span className="num shrink-0" style={{ fontSize: 15 }}>
            {m.score.home}–{m.score.away}
          </span>
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <ClubName team={m.away} size={13} />
            <Crest team={m.away} size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}

function MatchInfo({ match }) {
  const { t } = useT();
  const rows = [
    [t('match.venue'), match.venue],
    [t('match.referee'), match.referee],
    [t('match.attendance'), match.attendance?.toLocaleString('nl-NL')],
    [t('match.broadcaster'), match.broadcaster],
  ].filter(([, v]) => v);
  if (!rows.length) return null;
  return (
    <section className="mt-6">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="hair flex items-center justify-between px-4"
          style={{ height: 44, background: 'var(--surface-1)' }}
        >
          <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>{label}</span>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>{value}</span>
        </div>
      ))}
    </section>
  );
}
