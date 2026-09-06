import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { navigate } from '../lib/router.js';
import MatchRow from './MatchRow.jsx';
import { countdown, weekdayDayMonth, time } from '../lib/format.js';

/**
 * The empty state, which across a Dutch season is the app's most common state:
 * Tuesdays, Wednesdays outside cup weeks, and the whole of June.
 *
 * So it is not a shrug. It computes the actual next thing — the followed club's
 * next fixture — renders it as a real, tappable match row, and counts down to
 * it. An international break stops being the deadest screen in the app and
 * becomes the one that answers the question you actually had.
 */
export default function NextUp({ date }) {
  const { favourite, follows, profile } = useStore();
  const { t, locale } = useT();
  const [next, setNext] = useState(undefined);
  const [, tick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.matches({ following: '1', status: 'scheduled', limit: 40 })
      .then((d) => {
        if (cancelled) return;
        const upcoming = d.matches
          .filter((m) => new Date(m.kickoff).getTime() > Date.now())
          .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
        setNext(upcoming[0] || null);
      })
      .catch(() => setNext(null));
    return () => { cancelled = true; };
  }, [date, follows]);

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const c = next ? countdown(next.kickoff) : null;
  const mine = next && favourite
    && (next.home.id === favourite.id || next.away.id === favourite.id)
    ? favourite : null;

  return (
    <section>
      {/* Emptiness composed, not apologised for: a rule, a sentence, a rule. */}
      <div style={{ height: 1, background: 'var(--border)' }} aria-hidden />
      <p className="px-4 py-6" style={{ fontSize: 16, color: 'var(--text-2)', lineHeight: 1.45 }}>
        {t('empty.noMatchesToday')}
      </p>
      <div style={{ height: 1, background: 'var(--border)' }} aria-hidden />

      {next === undefined && <div style={{ height: 120 }} />}

      {next && (
        <>
          <div className="flex items-baseline gap-3 px-4" style={{ height: 44 }}>
            <span className="label" style={{ fontSize: 10, color: 'var(--accent)' }}>
              {t('empty.nextUp')}
            </span>
            <span className="label" style={{ fontSize: 10, color: 'var(--text-4)' }}>
              {weekdayDayMonth(next.kickoff, locale)} · {time(next.kickoff, locale)}
            </span>
          </div>

          {c && (
            <div className="flex items-baseline gap-2 px-4 pb-4">
              <span className="num" style={{ fontSize: 40, color: 'var(--text-1)' }}>
                {c.days > 0 ? c.days : c.hours}
              </span>
              <span className="label" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {c.days > 0 ? t('time.days') : t('time.hours')}
              </span>
              <span className="num" style={{ fontSize: 40, color: 'var(--text-2)' }}>
                {c.days > 0 ? c.hours : c.minutes}
              </span>
              <span className="label" style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {c.days > 0 ? t('time.hours') : t('time.minutes')}
              </span>
              {mine && (
                <span className="label ml-auto" style={{ fontSize: 10, color: 'var(--text-4)' }}>
                  {mine.short}
                </span>
              )}
            </div>
          )}

          <MatchRow
            match={next}
            followed
            spoilerFree={Boolean(profile?.spoilerFree)}
            onOpen={(m) => navigate(`match/${m.id}`)}
          />
        </>
      )}

      {next === null && <div style={{ height: 120 }} />}
    </section>
  );
}
