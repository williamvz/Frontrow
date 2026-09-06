import { useT } from '../i18n/index.jsx';

/**
 * THE MINUTE SPINE.
 *
 * Not a list of events with icons — a clock you can read. A single 2px rule is
 * the match, filled in the club colour from kick-off to the current minute and
 * empty below it. Each event sits at its true vertical position, so a 12th
 * minute goal is near the top and an 89th minute red card is near the bottom.
 * The shape of the match is visible before you read a word: three goals in ten
 * minutes look like three goals in ten minutes, and the unplayed part of the
 * spine is genuinely empty space — time that has not happened yet.
 */
const FULL = 96;              // 90 plus a realistic allowance for stoppage
const TOP = 16;
const HEIGHT = 460;
const SPINE_X = 52;
const MIN_GAP = 24;           // the smallest gap two event labels can survive

/**
 * Football clusters. Three goals and a substitution inside ten minutes is the
 * most interesting thing that can happen in a match and, on a true-time axis,
 * also the most illegible: the labels land on top of each other.
 *
 * So the labels de-collide — each is pushed down until it clears the one above
 * — while a connector line runs back to the event's real position on the spine.
 * The shape of the match is preserved and every line is readable.
 */
function layout(events, at) {
  const placed = [];
  let previous = -Infinity;
  for (const event of events) {
    const trueY = at(event.minute, event.minuteExtra);
    const y = Math.max(trueY, previous + MIN_GAP);
    placed.push({ event, y, trueY, offset: y - trueY > 2 });
    previous = y;
  }
  return placed;
}

export default function Timeline({ match, events }) {
  const { t } = useT();
  const live = ['live', 'halftime'].includes(match.status);
  const finished = match.status === 'finished';
  const current = finished ? FULL : (match.minute ?? 0);
  const progress = Math.min(1, Math.max(0, current / FULL));

  if (!events.length && !live && !finished) {
    return <Empty text={t('match.noEvents')} />;
  }

  const at = (minute, extra = 0) =>
    TOP + (Math.min(FULL, (minute ?? 0) + (extra ?? 0) / 10) / FULL) * HEIGHT;

  const placed = layout(events, at);
  const halftimeY = at(45);
  // Half-time is a full-width rule, so it needs the same clearance as a label.
  const shownHalftime = current > 45 || finished;
  const bottom = Math.max(HEIGHT + TOP, (placed.at(-1)?.y ?? 0) + 40);

  return (
    <section
      className="relative px-4"
      style={{ height: bottom + TOP, background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
    >
      {/* the spine */}
      <span
        aria-hidden
        style={{
          position: 'absolute', left: SPINE_X, top: TOP, width: 2, height: HEIGHT,
          background: 'var(--border)',
        }}
      />
      <span
        aria-hidden
        style={{
          position: 'absolute', left: SPINE_X, top: TOP, width: 2,
          height: HEIGHT * progress, background: 'var(--accent)',
          transition: 'height 1200ms linear',
        }}
      />

      {/* half time, as a full-width rule with a chip on it */}
      {shownHalftime && (
        <div
          aria-hidden
          style={{ position: 'absolute', left: 0, right: 0, top: halftimeY, height: 1, background: 'var(--border)' }}
        >
          <span
            className="label absolute"
            style={{
              left: SPINE_X + 14, top: -8, fontSize: 9, padding: '2px 6px',
              background: 'var(--surface-3)', color: 'var(--text-2)',
            }}
          >
            {t('status.ht')} {match.score.halftime ? `${match.score.halftime.home}–${match.score.halftime.away}` : ''}
          </span>
        </div>
      )}

      {/* minute gridlines, quietly */}
      {[15, 30, 60, 75, 90].map((mm) => (
        <span
          key={mm}
          aria-hidden
          className="num-soft absolute"
          style={{ left: 16, top: at(mm) - 7, fontSize: 10, color: 'var(--text-4)' }}
        >
          {mm}
        </span>
      ))}

      {placed.map(({ event, y, trueY, offset }) => (
        <EventMark key={event.id} event={event} match={match} y={y} trueY={trueY} offset={offset} />
      ))}

      {live && (
        <span
          aria-hidden
          style={{
            position: 'absolute', left: SPINE_X - 3, top: TOP + HEIGHT * progress - 4,
            width: 8, height: 8, background: 'var(--text-1)',
          }}
          className="fr-pulse"
        />
      )}
    </section>
  );
}

/** Home events sit right of the spine; away events indent a further 16px. */
function EventMark({ event, match, y, trueY, offset }) {
  const { t } = useT();
  const home = event.teamId === match.home.id;
  const goal = ['goal', 'penalty', 'own_goal'].includes(event.type);

  return (
    <>
      {/* the connector back to the minute this actually happened in */}
      {offset && (
        <svg
          aria-hidden
          className="absolute"
          style={{ left: SPINE_X + 2, top: Math.min(trueY, y), width: 12, height: Math.abs(y - trueY) + 1 }}
        >
          <path
            d={`M0 ${trueY < y ? 0.5 : Math.abs(y - trueY) + 0.5} H6 V${trueY < y ? Math.abs(y - trueY) + 0.5 : 0.5} H12`}
            stroke="var(--border-strong)" strokeWidth="1" fill="none"
          />
        </svg>
      )}
      <div
        className="absolute flex items-center gap-2"
        style={{ left: SPINE_X + 14 + (home ? 0 : 16), top: y - 10, right: 8 }}
      >
        <Glyph type={event.type} />
        <span className="num-soft shrink-0" style={{ fontSize: 11, color: 'var(--text-3)', width: 26 }}>
          {event.minuteDisplay || `${event.minute}'`}
        </span>
        <span className="min-w-0 truncate" style={{ fontSize: 13, color: goal ? 'var(--text-1)' : 'var(--text-2)' }}>
          {event.player || t(`event.${event.type}`)}
          {event.type === 'own_goal' && <Suffix>{t('event.ownGoalShort')}</Suffix>}
          {event.type === 'penalty' && <Suffix>{t('event.penaltyShort')}</Suffix>}
          {event.type === 'substitution' && event.related && <Suffix>← {event.related}</Suffix>}
          {event.assist && <Suffix>{event.assist}</Suffix>}
        </span>
        {goal && event.score && (
          <span className="num shrink-0" style={{ fontSize: 13 }}>
            {event.score.home}–{event.score.away}
          </span>
        )}
      </div>
    </>
  );
}

const Suffix = ({ children }) => (
  <span style={{ color: 'var(--text-4)', fontSize: 11, marginLeft: 6 }}>{children}</span>
);

/**
 * Shape first, colour second: a card is a rectangle whether or not you can tell
 * yellow from red, and a goal is a filled circle whether or not the club colour
 * happens to be the same hue.
 */
function Glyph({ type }) {
  if (type === 'yellow' || type === 'second_yellow') {
    return <span style={{ width: 7, height: 10, background: 'var(--warn)' }} aria-hidden />;
  }
  if (type === 'red') {
    return <span style={{ width: 7, height: 10, background: 'var(--loss)' }} aria-hidden />;
  }
  if (type === 'substitution') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        <path d="M1 3h6M5 1l2 2-2 2M9 7H3M5 5 3 7l2 2" stroke="var(--text-4)" strokeWidth="1.4" fill="none" />
      </svg>
    );
  }
  if (type === 'own_goal') {
    return <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--loss)' }} aria-hidden />;
  }
  if (['goal', 'penalty'].includes(type)) {
    return <span style={{ width: 9, height: 9, borderRadius: 9, background: 'var(--text-1)' }} aria-hidden />;
  }
  return <span style={{ width: 9, height: 9, borderRadius: 9, border: '1.5px solid var(--text-4)' }} aria-hidden />;
}

const Empty = ({ text }) => (
  <div
    className="flex items-center justify-center px-8 py-16 text-center"
    style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)' }}
  >
    <span style={{ fontSize: 14, color: 'var(--text-4)' }}>{text}</span>
  </div>
);
