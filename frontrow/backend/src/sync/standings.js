// League tables, computed from our own finished matches rather than scraped.
//
// Computing it ourselves means the table is correct the instant the last whistle
// goes — no waiting for a provider to refresh — and it means the "live table"
// (where in-play scores are folded in) is possible at all. Provider tables are
// only used for competitions whose rules we do not model.

import { getDb } from '../db/database.js';
import { nowIso } from '../util/time.js';
import { publish } from '../realtime/hub.js';
import { logger } from '../util/log.js';

const log = logger('standings');

// Dutch league tie-breakers, in order: points, then goal difference, then goals
// scored. (The KNVB uses a play-off for a decisive tie at the very top; that is
// a two-match event a table cannot express, so the table shows the ordering and
// the app says so in a footnote.)
const compare = (a, b) =>
  b.points - a.points
  || (b.goals_for - b.goals_against) - (a.goals_for - a.goals_against)
  || b.goals_for - a.goals_for
  || a.name.localeCompare(b.name, 'nl');

/**
 * @param {object} opts
 * @param {boolean} opts.includeLive  fold in-play scores into the table
 */
export function computeTable(seasonId, { includeLive = false } = {}) {
  const db = getDb();
  const statuses = includeLive
    ? ['finished', 'live', 'halftime']
    : ['finished'];

  const teams = db.prepare(`
    SELECT t.id, t.name, t.short_name, t.code, t.crest_url, t.primary_color, t.secondary_color
    FROM season_teams st JOIN teams t ON t.id = st.team_id
    WHERE st.season_id = ?`).all(seasonId);

  const rows = new Map(teams.map((t) => [t.id, {
    team_id: t.id, name: t.name, played: 0, won: 0, drawn: 0, lost: 0,
    goals_for: 0, goals_against: 0, points: 0, form: [],
  }]));

  const matches = db.prepare(`
    SELECT * FROM matches
    WHERE season_id = ? AND status IN (${statuses.map(() => '?').join(',')})
      AND home_score IS NOT NULL AND away_score IS NOT NULL
    ORDER BY kickoff_utc`).all(seasonId, ...statuses);

  for (const m of matches) {
    const home = rows.get(m.home_team_id);
    const away = rows.get(m.away_team_id);
    if (!home || !away) continue;

    home.played += 1; away.played += 1;
    home.goals_for += m.home_score; home.goals_against += m.away_score;
    away.goals_for += m.away_score; away.goals_against += m.home_score;

    if (m.home_score > m.away_score) {
      home.won += 1; home.points += 3; away.lost += 1;
      home.form.push('W'); away.form.push('L');
    } else if (m.home_score < m.away_score) {
      away.won += 1; away.points += 3; home.lost += 1;
      home.form.push('L'); away.form.push('W');
    } else {
      home.drawn += 1; away.drawn += 1; home.points += 1; away.points += 1;
      home.form.push('D'); away.form.push('D');
    }
  }

  const table = [...rows.values()].sort(compare).map((r, i) => ({
    ...r,
    position: i + 1,
    goal_diff: r.goals_for - r.goals_against,
    form: r.form.slice(-5).join(''),
  }));

  return table;
}

/**
 * European places and relegation, as the Eredivisie actually works: the
 * champion goes to the Champions League league phase, second and third play
 * qualifiers, fourth through eighth enter the European play-offs, the bottom
 * two go down and 16th plays the promotion/relegation play-offs.
 */
function zoneFor(competitionId, position, total) {
  if (competitionId === 'eredivisie') {
    if (position === 1) return 'champion';
    if (position === 2) return 'ucl';
    if (position === 3) return 'uel';
    if (position <= 8) return 'playoff_europe';
    if (position >= total - 1) return 'relegation';
    if (position === total - 2) return 'playoff_relegation';
    return null;
  }
  if (competitionId === 'kkd') {
    if (position <= 2) return 'promotion';
    if (position <= 9) return 'playoff_promotion';
    return null;
  }
  return null;
}

/** Recompute and persist a season's table. Announces when the order changed. */
export function refreshStandings(seasonId, competitionId) {
  const db = getDb();
  const table = computeTable(seasonId);
  if (!table.length) return 0;

  const previous = new Map(
    db.prepare('SELECT team_id, position FROM standings WHERE season_id = ? AND group_key = \'\'')
      .all(seasonId).map((r) => [r.team_id, r.position]),
  );

  const write = db.prepare(`
    INSERT INTO standings (season_id, group_key, team_id, position, played, won, drawn, lost,
                           goals_for, goals_against, goal_diff, points, form, prev_position,
                           zone, source, updated_at)
    VALUES (@season_id, '', @team_id, @position, @played, @won, @drawn, @lost,
            @goals_for, @goals_against, @goal_diff, @points, @form, @prev_position,
            @zone, 'computed', @updated_at)
    ON CONFLICT(season_id, group_key, team_id) DO UPDATE SET
      position = excluded.position, played = excluded.played, won = excluded.won,
      drawn = excluded.drawn, lost = excluded.lost, goals_for = excluded.goals_for,
      goals_against = excluded.goals_against, goal_diff = excluded.goal_diff,
      points = excluded.points, form = excluded.form,
      prev_position = excluded.prev_position, zone = excluded.zone,
      updated_at = excluded.updated_at`);

  let moved = 0;
  db.transaction(() => {
    for (const r of table) {
      const prev = previous.get(r.team_id) ?? null;
      if (prev !== null && prev !== r.position) moved += 1;
      write.run({
        season_id: seasonId, team_id: r.team_id, position: r.position,
        played: r.played, won: r.won, drawn: r.drawn, lost: r.lost,
        goals_for: r.goals_for, goals_against: r.goals_against,
        goal_diff: r.goal_diff, points: r.points, form: r.form,
        prev_position: prev, zone: zoneFor(competitionId, r.position, table.length),
        updated_at: nowIso(),
      });
    }
  })();

  if (moved) publish('standings:update', { seasonId, competitionId, moved });
  log.debug(`${competitionId}: table refreshed (${table.length} teams, ${moved} moved)`);
  return table.length;
}

/** Snapshot the table after a matchday, for the position-over-time ribbon. */
export function snapshotStandings(seasonId, matchday) {
  const db = getDb();
  const rows = db.prepare('SELECT team_id, position, points FROM standings WHERE season_id = ?').all(seasonId);
  const ins = db.prepare(`INSERT OR REPLACE INTO standings_history (season_id, team_id, matchday, position, points)
                          VALUES (?, ?, ?, ?, ?)`);
  db.transaction(() => { for (const r of rows) ins.run(seasonId, r.team_id, matchday, r.position, r.points); })();
}

/** Top scorers for a season, straight out of the event log. */
export function topScorers(seasonId, limit = 20) {
  return getDb().prepare(`
    SELECT e.player_name AS player, e.team_id, t.name AS team_name, t.short_name AS team_short,
           t.primary_color, COUNT(*) AS goals,
           SUM(CASE WHEN e.type = 'penalty' THEN 1 ELSE 0 END) AS penalties
    FROM match_events e
    JOIN matches m ON m.id = e.match_id
    JOIN teams t ON t.id = e.team_id
    WHERE m.season_id = ? AND e.type IN ('goal', 'penalty') AND e.player_name IS NOT NULL
    GROUP BY e.player_name, e.team_id
    ORDER BY goals DESC, player
    LIMIT ?`).all(seasonId, limit);
}

/** Assist leaders, same idea. */
export function topAssists(seasonId, limit = 20) {
  return getDb().prepare(`
    SELECT e.assist_name AS player, e.team_id, t.name AS team_name, t.short_name AS team_short,
           t.primary_color, COUNT(*) AS assists
    FROM match_events e
    JOIN matches m ON m.id = e.match_id
    JOIN teams t ON t.id = e.team_id
    WHERE m.season_id = ? AND e.assist_name IS NOT NULL
    GROUP BY e.assist_name, e.team_id
    ORDER BY assists DESC, player
    LIMIT ?`).all(seasonId, limit);
}
