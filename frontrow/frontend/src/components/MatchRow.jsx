import { memo } from 'react';
import Crest from './Crest.jsx';
import ClubName from './ClubName.jsx';
import Score from './Score.jsx';
import LiveBlock from './LiveBlock.jsx';
import { time } from '../lib/format.js';
import { useT } from '../i18n/index.jsx';

/**
 * The atomic unit of Frontrow: a broadcast lower third.
 *
 * Full-bleed to both edges, 72px tall, square corners, one hairline below. A
 * 3px club-colour tab on the left edge is the ONLY difference between a match
 * involving a club you follow and one that does not — no badge, no star, no
 * reordering. On a 390px screen that stripe is 0.77% of the width and it is
 * unmissable, because it is the only saturated colour in a band of near-black.
 *
 * Column grid: [3px tab] [52px state] [1fr teams] [score] [16px gutter].
 * Height is fixed, which is what lets a long list stay smooth.
 */
function MatchRow({ match, followed = false, flaring = false, onOpen, spoilerFree = false }) {
  const { t, locale } = useT();
  const { status } = match;

  const live = status === 'live';
  const halftime = status === 'halftime';
  const finished = status === 'finished';
  const off = ['postponed', 'cancelled', 'abandoned'].includes(status);
  const played = live || halftime || finished;

  // A finished match should be readable as a result without reading the
  // numbers: the winner keeps full contrast, the loser steps back. This is the
  // highest-value detail in the whole component.
  const homeScore = match.score.home;
  const awayScore = match.score.away;
  const homeWon = finished && homeScore > awayScore;
  const awayWon = finished && awayScore > homeScore;
  const dimHome = finished && awayWon;
  const dimAway = finished && homeWon;

  const hidden = spoilerFree && played;

  return (
    <button
      type="button"
      onClick={() => onOpen?.(match)}
      className={`relative grid w-full items-center text-left transition-colors duration-150 ${flaring ? 'fr-flare' : ''}`}
      style={{
        gridTemplateColumns: '3px 52px 1fr max-content 16px',
        gridTemplateRows: '36px 36px',
        height: 'var(--row-h)',
        background: 'var(--surface-1)',
        borderBottom: '1px solid var(--border)',
      }}
      aria-label={ariaLabel(match, t, locale, hidden)}
    >
      {/* 1 — the club tab, flush to the viewport edge */}
      <span
        style={{
          gridRow: '1 / 3',
          width: 3,
          height: '100%',
          background: followed ? 'var(--accent)' : 'transparent',
        }}
        aria-hidden
      />

      {/* 2 — the state block */}
      <span
        className="flex h-full items-center justify-center"
        style={{ gridRow: '1 / 3', borderRight: '1px solid var(--border)' }}
      >
        {live && <LiveBlock minute={match.minute} minuteDisplay={match.minuteDisplay} />}
        {halftime && <LiveBlock halftime label={t('status.ht')} />}
        {finished && (
          <span className="label" style={{ fontSize: 11, color: 'var(--text-3)' }}>
            {match.score.penalties ? t('status.pens') : t('status.ft')}
          </span>
        )}
        {status === 'scheduled' && (
          <span className="num-soft" style={{ fontSize: 15, color: 'var(--text-2)' }}>
            {time(match.kickoff, locale)}
          </span>
        )}
        {off && (
          <span className="label text-center" style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.1 }}>
            {t(`status.${status}`)}
          </span>
        )}
      </span>

      {/* 3 — the two team lines */}
      <span className="flex h-full min-w-0 flex-col justify-center gap-0 pl-3">
        <TeamLine team={match.home} dim={off || dimHome} bold={live || halftime || homeWon} />
        <TeamLine team={match.away} dim={off || dimAway} bold={live || halftime || awayWon} />
      </span>

      {/* 4 — the score, one per line, as a broadcast rundown does it. The two
          bands are 36px each so a score always sits on its team's baseline. */}
      <span className="flex h-full flex-col items-end" style={{ minWidth: 26 }}>
        {hidden ? (
          <span
            className="label flex h-full items-center"
            style={{ fontSize: 12, color: 'var(--text-3)' }}
          >
            ● ●
          </span>
        ) : played ? (
          <>
            <span className="flex items-center gap-1.5" style={{ height: 36 }}>
              {match.score.penalties && (
                <span className="num-soft" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  ({match.score.penalties.home})
                </span>
              )}
              <Score value={homeScore} dim={dimHome} />
            </span>
            <span className="flex items-center gap-1.5" style={{ height: 36 }}>
              {match.score.penalties && (
                <span className="num-soft" style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  ({match.score.penalties.away})
                </span>
              )}
              <Score value={awayScore} dim={dimAway} />
            </span>
          </>
        ) : null}
      </span>

      <span />
    </button>
  );
}

function TeamLine({ team, dim, bold }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5" style={{ height: 36 }}>
      <Crest team={team} size={20} />
      <ClubName team={team} dim={dim} weight={bold ? 600 : 500} />
    </span>
  );
}

/**
 * One utterance per row, not four fragments — a screen reader should say
 * "Ajax 2, PSV 1, 67 minuten", which is what a sighted user sees in one glance.
 */
function ariaLabel(m, t, locale, hidden) {
  const teams = `${m.home.name} – ${m.away.name}`;
  if (hidden) return `${teams}, ${t('settings.spoilerFree')}`;
  if (m.status === 'scheduled') return `${teams}, ${time(m.kickoff, locale)}`;
  const score = `${m.score.home ?? 0}-${m.score.away ?? 0}`;
  if (m.status === 'live') return `${teams}, ${score}, ${m.minuteDisplay || `${m.minute}'`}`;
  return `${teams}, ${score}, ${t(`status.${m.status}`)}`;
}

// A minute tick on nine live matches must re-render nine small text nodes and
// nothing else.
export default memo(MatchRow, (a, b) => (
  a.match.id === b.match.id
  && a.match.score.home === b.match.score.home
  && a.match.score.away === b.match.score.away
  && a.match.status === b.match.status
  && a.match.minute === b.match.minute
  && a.match.minuteDisplay === b.match.minuteDisplay
  && a.followed === b.followed
  && a.flaring === b.flaring
  && a.spoilerFree === b.spoilerFree
));
