import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n/index.jsx';
import { useStore } from '../store.jsx';
import { addDays, localDate, freshness } from '../lib/format.js';

/**
 * The header. 56px, sticky, with the club-colour bar flush to the left edge —
 * the first thing on screen and the app's signature.
 */
export function Header({ title, subtitle, right, onBack }) {
  return (
    <header
      className="sticky top-0 z-30"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="safe-top" />
      <div className="relative flex items-center" style={{ height: 'var(--header-h)' }}>
        <span
          className="absolute left-0 top-0"
          style={{ width: 3, height: '100%', background: 'var(--accent)' }}
          aria-hidden
        />
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex h-11 w-11 items-center justify-center"
            style={{ marginLeft: 4, color: 'var(--text-2)' }}
            aria-label="Terug"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 4 7 12l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="square" />
            </svg>
          </button>
        )}
        <div className="min-w-0 flex-1" style={{ paddingLeft: onBack ? 4 : 16 }}>
          <div
            className="label-wide truncate"
            style={{ fontSize: 15, color: 'var(--text-1)', lineHeight: 1.1 }}
          >
            {title}
          </div>
          {subtitle && (
            <div className="label truncate" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {subtitle}
            </div>
          )}
        </div>
        <div className="flex items-center pr-3">{right}</div>
      </div>
    </header>
  );
}

/**
 * Honest staleness.
 *
 * There is no ad to hide behind and no reason to fake liveness. When the socket
 * drops or the data goes cold, a rule appears under the header and says so.
 * The app visibly stops pretending, which is worth more than a spinner.
 */
export function ConnectionRule() {
  const { connection, lastSyncAt } = useStore();
  const { t } = useT();
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(id);
  }, []);

  const stale = lastSyncAt && Date.now() - new Date(lastSyncAt).getTime() > 90000;
  const down = connection === 'reconnecting' || connection === 'closed';
  if (!stale && !down) return null;

  return (
    <div
      className="label flex items-center justify-center gap-2"
      style={{
        height: 20,
        fontSize: 10,
        background: down ? 'var(--loss)' : 'var(--warn)',
        color: 'var(--bg)',
      }}
      role="status"
    >
      {down ? t('common.reconnecting') : `${t('common.updated')} ${freshness(lastSyncAt, t)}`}
    </div>
  );
}

/**
 * The date ribbon: a snap rail of 44px days. Yesterday and tomorrow stay
 * partially visible at the edges, so it reads as a continuous week rather than
 * a picker, and a day with a followed club's fixture carries a small square.
 */
export function DateRibbon() {
  const { date, day, actions, follows } = useStore();
  const { list, locale } = useT();
  const railRef = useRef(null);
  const short = list('weekdayShort');

  const days = useMemo(() => {
    const today = localDate();
    return Array.from({ length: 14 }, (_, i) => addDays(today, i - 3));
  }, []);

  const busy = useMemo(() => {
    const map = {};
    for (const d of day?.days || []) map[d.d] = d;
    return map;
  }, [day]);

  const followedTeams = useMemo(
    () => new Set(follows.filter((f) => f.kind === 'team').map((f) => f.id)),
    [follows],
  );

  // scrollIntoView would also scroll the *document* to bring the ribbon into
  // view, which silently pushes the first match row under the sticky header.
  // Scroll the rail itself and leave the page alone.
  useEffect(() => {
    const rail = railRef.current;
    const el = rail?.querySelector('[data-selected="1"]');
    if (!rail || !el) return;
    rail.scrollTo({
      left: el.offsetLeft - rail.clientWidth / 2 + el.clientWidth / 2,
      behavior: 'smooth',
    });
  }, [date]);

  return (
    <nav
      ref={railRef}
      className="rail sticky z-20 flex items-stretch"
      style={{
        top: 'calc(var(--header-h) + var(--chrome-top))',
        height: 'var(--ribbon-h)',
        background: 'var(--bg)',
        borderBottom: '1px solid var(--border)',
        paddingInline: 12,
        gap: 4,
      }}
      aria-label="Datum"
    >
      {days.map((d) => {
        const selected = d === date;
        const isToday = d === localDate();
        const info = busy[d];
        const dot = info && info.n > 0;
        const mine = dot && followedTeams.size > 0;
        return (
          <button
            key={d}
            type="button"
            data-selected={selected ? '1' : '0'}
            onClick={() => actions.setDate(d)}
            className="relative flex shrink-0 flex-col items-center justify-center"
            style={{
              width: 44,
              scrollSnapAlign: 'center',
              background: selected ? 'var(--accent-soft)' : 'transparent',
            }}
            aria-current={selected ? 'date' : undefined}
          >
            <span
              className="label"
              style={{ fontSize: 10, color: selected ? 'var(--accent)' : 'var(--text-3)' }}
            >
              {short[new Date(`${d}T12:00:00Z`).getUTCDay()]}
            </span>
            <span
              className="num-soft"
              style={{
                fontSize: 15,
                marginTop: 1,
                color: selected || isToday ? 'var(--text-1)' : 'var(--text-2)',
                fontVariationSettings: selected ? "'wght' 800, 'wdth' 104" : undefined,
              }}
            >
              {Number(d.slice(8, 10))}
            </span>
            {dot && (
              <span
                style={{
                  position: 'absolute', bottom: 5, width: 3, height: 3,
                  background: info.live > 0 ? 'var(--text-1)' : mine ? 'var(--accent)' : 'var(--text-4)',
                }}
                aria-hidden
              />
            )}
            {selected && (
              <span
                className="fr-wipe"
                style={{
                  position: 'absolute', bottom: -1, left: 0, right: 0,
                  height: 3, background: 'var(--accent)',
                }}
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

const TABS = [
  { id: 'vandaag', key: 'nav.today', icon: 'today' },
  { id: 'competities', key: 'nav.table', icon: 'table' },
  { id: 'mijn', key: 'nav.mine', icon: 'star' },
  { id: 'meer', key: 'nav.more', icon: 'more' },
];

/** The bottom bar. The active tab is marked by a club-colour bar on its top edge. */
export function TabBar({ route, onNavigate }) {
  const { t } = useT();
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-30 flex"
      style={{ background: 'var(--bg)', borderTop: '1px solid var(--border)' }}
      aria-label="Hoofdnavigatie"
    >
      {TABS.map((tab) => {
        const active = route === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onNavigate(tab.id)}
            className="relative flex flex-1 flex-col items-center justify-center gap-1"
            style={{ height: 'var(--tabbar-h)', color: active ? 'var(--text-1)' : 'var(--text-3)' }}
            aria-current={active ? 'page' : undefined}
          >
            {active && (
              <span
                style={{
                  position: 'absolute', top: 0, width: 24, height: 2, background: 'var(--accent)',
                }}
                aria-hidden
              />
            )}
            <TabIcon name={tab.icon} />
            <span className="label" style={{ fontSize: 10 }}>{t(tab.key)}</span>
          </button>
        );
      })}
      <div className="safe-bottom absolute bottom-0 left-0 right-0" style={{ pointerEvents: 'none' }} />
    </nav>
  );
}

function TabIcon({ name }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true };
  const stroke = { stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'square' };
  if (name === 'today') {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" {...stroke} />
        <path d="M3 10h18M8 3v4M16 3v4" {...stroke} />
      </svg>
    );
  }
  if (name === 'table') {
    return (
      <svg {...common}>
        <path d="M4 6h16M4 12h16M4 18h16" {...stroke} />
        <path d="M4 6v12" {...stroke} />
      </svg>
    );
  }
  if (name === 'star') {
    return (
      <svg {...common}>
        <path d="M12 3.5 14.6 9l6 .8-4.4 4.2 1.1 6-5.3-2.9L6.7 20l1.1-6L3.4 9.8 9.4 9z" {...stroke} />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The bottom padding every scrolling page needs to clear the fixed tab bar. */
export const TabBarSpacer = () => (
  <div style={{ height: 'calc(var(--tabbar-h) + env(safe-area-inset-bottom, 0px) + 8px)' }} aria-hidden />
);
