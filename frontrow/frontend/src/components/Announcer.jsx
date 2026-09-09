import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { useT } from '../i18n/index.jsx';

/**
 * One screen-reader announcer for the whole app.
 *
 * The obvious approach — aria-live on every match row's score — produces
 * eighteen competing live regions on a nine-match Saturday, and a screen reader
 * reads them as an unusable stream of fragments. Instead there is exactly one
 * polite region, it announces whole sentences, and it announces at most one
 * every three seconds.
 */
const THROTTLE_MS = 3000;

export default function Announcer() {
  const { flaring, teams } = useStore();
  const { t } = useT();
  const [message, setMessage] = useState('');
  const queue = useRef([]);
  const seen = useRef(new Set());
  const timer = useRef(null);

  useEffect(() => {
    for (const [matchId, entry] of Object.entries(flaring)) {
      const key = matchId + entry.at;
      if (seen.current.has(key)) continue;
      seen.current.add(key);

      const g = entry.goal;
      const scorer = teams[g?.scoringTeamId];
      const home = teams[g?.homeTeamId];
      const away = teams[g?.awayTeamId];
      if (!scorer || !home || !away) continue;

      const who = g.player ? `${g.player}, ${g.minute} minuten.` : `${g.minute} minuten.`;
      queue.current.push(
        `${t('event.goal')} ${scorer.name}. ${home.short} ${g.homeScore}, ${away.short} ${g.awayScore}. ${who}`,
      );
    }
  }, [flaring, teams, t]);

  useEffect(() => {
    const pump = () => {
      const next = queue.current.shift();
      if (next) setMessage(next);
      timer.current = setTimeout(pump, THROTTLE_MS);
    };
    timer.current = setTimeout(pump, THROTTLE_MS);
    return () => clearTimeout(timer.current);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      style={{
        position: 'absolute', width: 1, height: 1, margin: -1,
        padding: 0, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0,
      }}
    >
      {message}
    </div>
  );
}
