import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/index.jsx';

/**
 * Match statistics as two-colour bars.
 *
 * One 6px row per stat, split at the centre: the home value grows leftward in
 * the home club's colour, the away value rightward in the away club's. Because
 * two clubs can share a colour (a Rotterdam derby is red against red), the away
 * side falls back to a neutral whenever the two are too close to tell apart.
 */
const ORDER = [
  'possessionPct', 'totalShots', 'shotsOnTarget', 'wonCorners',
  'foulsCommitted', 'offsides', 'accuratePasses', 'yellowCards',
];

const LABELS_NL = {
  possessionPct: 'Balbezit',
  totalShots: 'Schoten',
  shotsOnTarget: 'Op doel',
  wonCorners: 'Corners',
  foulsCommitted: 'Overtredingen',
  offsides: 'Buitenspel',
  accuratePasses: 'Passes aangekomen',
  yellowCards: 'Gele kaarten',
  saves: 'Reddingen',
  blockedShots: 'Geblokt',
  totalTackles: 'Duels gewonnen',
};
const LABELS_EN = {
  possessionPct: 'Possession',
  totalShots: 'Shots',
  shotsOnTarget: 'On target',
  wonCorners: 'Corners',
  foulsCommitted: 'Fouls',
  offsides: 'Offsides',
  accuratePasses: 'Accurate passes',
  yellowCards: 'Yellow cards',
  saves: 'Saves',
  blockedShots: 'Blocked',
  totalTackles: 'Tackles won',
};

export default function StatBars({ match, stats }) {
  const { t, locale } = useT();
  const ref = useRef(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!stats.length) {
    return (
      <div className="px-8 py-16 text-center" style={{ background: 'var(--surface-1)' }}>
        <span style={{ fontSize: 14, color: 'var(--text-4)' }}>{t('match.noStats')}</span>
      </div>
    );
  }

  const byMetric = {};
  for (const s of stats) {
    byMetric[s.metric] = byMetric[s.metric] || {};
    byMetric[s.metric][s.side] = s.value;
  }

  const metrics = [
    ...ORDER.filter((m) => byMetric[m]),
    ...Object.keys(byMetric).filter((m) => !ORDER.includes(m)),
  ];
  const labels = locale === 'en' ? LABELS_EN : LABELS_NL;

  return (
    <section ref={ref} className="px-4 py-5" style={{ background: 'var(--surface-1)' }}>
      {metrics.map((metric, i) => {
        const home = byMetric[metric].home ?? 0;
        const away = byMetric[metric].away ?? 0;
        const total = home + away || 1;
        return (
          <div key={metric} className="mb-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="num" style={{ fontSize: 15 }}>{fmt(metric, home)}</span>
              <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>
                {labels[metric] || metric}
              </span>
              <span className="num" style={{ fontSize: 15 }}>{fmt(metric, away)}</span>
            </div>
            <div className="flex" style={{ height: 6, background: 'var(--surface-3)' }}>
              <span
                style={{
                  width: `${(home / total) * 100}%`,
                  background: 'var(--accent)',
                  transform: shown ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'right',
                  transition: `transform 520ms var(--ease-wipe) ${i * 28}ms`,
                }}
              />
              <span
                style={{
                  width: `${(away / total) * 100}%`,
                  background: 'var(--accent-2)',
                  transform: shown ? 'scaleX(1)' : 'scaleX(0)',
                  transformOrigin: 'left',
                  transition: `transform 520ms var(--ease-wipe) ${i * 28}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
      <Legend match={match} />
    </section>
  );
}

const fmt = (metric, v) => (metric.endsWith('Pct') ? `${Math.round(v)}%` : Math.round(v));

function Legend({ match }) {
  return (
    <div className="mt-5 flex items-center justify-between">
      <span className="flex items-center gap-2">
        <span style={{ width: 10, height: 10, background: 'var(--accent)' }} aria-hidden />
        <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>{match.home.short}</span>
      </span>
      <span className="flex items-center gap-2">
        <span className="label" style={{ fontSize: 10, color: 'var(--text-3)' }}>{match.away.short}</span>
        <span style={{ width: 10, height: 10, background: 'var(--accent-2)' }} aria-hidden />
      </span>
    </div>
  );
}
