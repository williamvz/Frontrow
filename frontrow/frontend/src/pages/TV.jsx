import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import Crest from '../components/Crest.jsx';
import { time } from '../lib/format.js';

/**
 * TV mode — a scoreboard for a screen on the wall.
 *
 * No navigation, no chrome, no tap targets. Everything is sized for four metres
 * away rather than forty centimetres, and it holds the screen awake for as long
 * as the browser will let it. This is the mode a Home Assistant dashboard or an
 * old tablet in the kitchen runs on a Saturday afternoon.
 */
export default function TV() {
  const { day, lastSyncAt, flaring } = useStore();
  const { t, locale } = useT();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Inside Home Assistant, ask the panel to hide HA's sidebar and header so the
  // scoreboard really is the whole screen. Outside it, this is a no-op.
  useEffect(() => {
    if (window.self === window.top) return undefined;
    const send = (kioskMode) => window.parent.postMessage(
      { type: 'home-assistant/subscribe-properties', kioskMode, handleSafeArea: true },
      window.location.origin,
    );
    send(true);
    return () => send(false);
  }, []);

  // Keep the wall display awake for as long as the browser allows.
  useEffect(() => {
    let lock = null;
    const request = async () => {
      try { lock = await navigator.wakeLock?.request('screen'); } catch { /* unsupported or denied */ }
    };
    request();
    const onVisible = () => { if (document.visibilityState === 'visible') request(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { document.removeEventListener('visibilitychange', onVisible); lock?.release?.(); };
  }, []);

  const matches = (day?.groups || []).flatMap((g) => g.matches.map((m) => ({ ...m, comp: g.competition })));
  const live = matches.filter((m) => ['live', 'halftime'].includes(m.status));
  const rest = matches.filter((m) => !['live', 'halftime'].includes(m.status));
  const ordered = [...live, ...rest];

  return (
    <main
      className="min-h-dvh"
      style={{ background: 'var(--bg)', padding: 'clamp(16px, 3vw, 48px)' }}
      onClick={() => window.history.back()}
    >
      <header className="mb-6 flex items-baseline justify-between">
        <span className="label-wide" style={{ fontSize: 'clamp(18px, 2.2vw, 34px)', color: 'var(--text-1)' }}>
          {t('app.name')}
        </span>
        <span className="num" style={{ fontSize: 'clamp(20px, 2.6vw, 40px)', color: 'var(--text-2)' }}>
          {now.toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' })}
        </span>
      </header>

      <div
        className="grid gap-px"
        style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))', background: 'var(--border)' }}
      >
        {ordered.map((m) => {
          const isLive = ['live', 'halftime'].includes(m.status);
          const played = isLive || m.status === 'finished';
          return (
            <div
              key={m.id}
              className={flaring[m.id] ? 'fr-flare' : ''}
              style={{
                background: 'var(--surface-1)',
                padding: 'clamp(12px, 1.4vw, 22px)',
                borderLeft: `4px solid ${isLive ? 'var(--text-1)' : 'transparent'}`,
              }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="label" style={{ fontSize: 'clamp(9px, 0.8vw, 14px)', color: 'var(--text-4)' }}>
                  {m.comp.abbr}
                </span>
                <span
                  className={isLive && m.status === 'live' ? 'num fr-pulse' : 'label'}
                  style={{
                    fontSize: 'clamp(11px, 1vw, 18px)',
                    color: isLive ? 'var(--text-1)' : 'var(--text-4)',
                  }}
                >
                  {m.status === 'live' ? (m.minuteDisplay || `${m.minute}'`)
                    : m.status === 'halftime' ? t('status.ht')
                      : m.status === 'finished' ? t('status.ft')
                        : time(m.kickoff, locale)}
                </span>
              </div>
              <Line team={m.home} score={m.score.home} played={played} />
              <Line team={m.away} score={m.score.away} played={played} />
            </div>
          );
        })}
      </div>

      {!ordered.length && (
        <p className="label py-24 text-center" style={{ fontSize: 'clamp(12px, 1.4vw, 22px)', color: 'var(--text-4)' }}>
          {t('empty.noMatchesToday')}
        </p>
      )}

      <footer className="label mt-6 text-right" style={{ fontSize: 'clamp(9px, 0.8vw, 13px)', color: 'var(--text-4)' }}>
        {lastSyncAt && new Date(lastSyncAt).toLocaleTimeString('nl-NL', { timeZone: 'Europe/Amsterdam' })}
      </footer>
    </main>
  );
}

function Line({ team, score, played }) {
  return (
    <div className="flex items-center gap-3" style={{ height: 'clamp(34px, 3vw, 52px)' }}>
      <Crest team={team} size={26} />
      <span
        className="min-w-0 flex-1 truncate"
        style={{
          fontSize: 'clamp(15px, 1.5vw, 26px)', color: 'var(--text-1)',
          fontVariationSettings: "'wght' 600, 'wdth' 92",
        }}
      >
        {team.short}
      </span>
      <span className="num" style={{ fontSize: 'clamp(22px, 2.4vw, 42px)', color: 'var(--text-1)' }}>
        {played ? (score ?? 0) : ''}
      </span>
    </div>
  );
}
