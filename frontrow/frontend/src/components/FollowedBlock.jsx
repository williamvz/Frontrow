import { useEffect, useState } from 'react';
import Crest from './Crest.jsx';
import ClubName from './ClubName.jsx';
import Score from './Score.jsx';
import LiveBlock from './LiveBlock.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import { time, countdown } from '../lib/format.js';

/**
 * Your club, given the top of the screen.
 *
 * This is the only place in the app that breaks the 72px rundown rhythm, and it
 * earns that by being the reason most people opened the app. It appears only
 * when the followed club actually plays on the selected day.
 */
export default function FollowedBlock({ match, competition }) {
  const { t, locale } = useT();
  const live = ['live', 'halftime'].includes(match.status);
  const played = live || match.status === 'finished';

  return (
    <button
      type="button"
      onClick={() => navigate(`match/${match.id}`)}
      className="relative block w-full text-left"
      style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
    >
      <span
        className="absolute left-0 top-0"
        style={{ width: 3, height: '100%', background: 'var(--accent)' }}
        aria-hidden
      />

      <div className="flex items-center justify-between px-4 pt-4">
        <span className="label" style={{ fontSize: 10, letterSpacing: '0.12em', color: 'var(--accent)' }}>
          {t('team.isFavourite')}
        </span>
        <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>
          {competition?.name}
          {match.round ? ` · ${match.round}` : ''}
        </span>
      </div>

      <div className="flex items-center gap-4 px-4 pb-3 pt-3">
        <div className="min-w-0 flex-1">
          <Side team={match.home} />
          <div style={{ height: 8 }} />
          <Side team={match.away} />
        </div>

        {played ? (
          <div className="flex items-center gap-4">
            <span style={{ width: 2, height: 44, background: 'var(--border-strong)' }} aria-hidden />
            <div className="flex flex-col items-end">
              <Score value={match.score.home} size={36} />
              <Score value={match.score.away} size={36} />
            </div>
          </div>
        ) : (
          <span className="num" style={{ fontSize: 28, color: 'var(--text-2)' }}>
            {time(match.kickoff, locale)}
          </span>
        )}
      </div>

      <div
        className="flex items-center gap-3 px-4"
        style={{ height: 32, borderTop: '1px solid var(--border)' }}
      >
        {match.status === 'live' && <LiveBlock minute={match.minute} minuteDisplay={match.minuteDisplay} />}
        {match.status === 'halftime' && <LiveBlock halftime label={t('status.ht')} />}
        {match.status === 'finished' && (
          <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>{t('status.ftLong')}</span>
        )}
        {match.status === 'scheduled' && <Countdown iso={match.kickoff} />}
        {match.venue && (
          <span className="label truncate" style={{ fontSize: 10, color: 'var(--text-4)' }}>{match.venue}</span>
        )}
      </div>
    </button>
  );
}

function Side({ team }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Crest team={team} size={28} />
      <ClubName team={team} size={18} weight={600} />
    </span>
  );
}

function Countdown({ iso }) {
  const { t } = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const c = countdown(iso);
  if (!c) return null;
  const text = c.days > 0
    ? `${c.days}${t('time.days')} ${c.hours}${t('time.hours')}`
    : c.hours > 0
      ? `${c.hours}${t('time.hours')} ${String(c.minutes).padStart(2, '0')}${t('time.minutes')}`
      : `${c.minutes}:${String(c.seconds).padStart(2, '0')}`;
  return (
    <span
      className="label"
      style={{ fontSize: 10, color: c.total < 900 ? 'var(--accent)' : 'var(--text-2)' }}
    >
      {t('match.startsIn', { time: text })}
    </span>
  );
}
