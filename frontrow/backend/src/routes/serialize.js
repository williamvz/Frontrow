// One place that decides what a match looks like on the wire.
//
// The client never does joins or lookups: a match arrives with its teams
// already embedded, colours included, so a list of 40 matches renders without
// a single extra request and the theming engine has everything it needs.

import { getDb } from '../db/database.js';

const TEAM_COLUMNS = `
  t.id, t.name, t.short_name, t.code, t.crest_url, t.primary_color, t.secondary_color, t.city`;

export const MATCH_SELECT = `
  SELECT m.*,
         h.name AS home_name, h.short_name AS home_short, h.code AS home_code,
         h.crest_url AS home_crest, h.primary_color AS home_color, h.secondary_color AS home_color2,
         a.name AS away_name, a.short_name AS away_short, a.code AS away_code,
         a.crest_url AS away_crest, a.primary_color AS away_color, a.secondary_color AS away_color2,
         c.short_name AS competition_name, c.abbr AS competition_abbr, c.accent AS competition_accent,
         c.kind AS competition_kind, c.sort_order AS competition_order
  FROM matches m
  JOIN teams h ON h.id = m.home_team_id
  JOIN teams a ON a.id = m.away_team_id
  JOIN competitions c ON c.id = m.competition_id`;

export function matchJson(row) {
  if (!row) return null;
  return {
    id: row.id,
    competition: {
      id: row.competition_id,
      name: row.competition_name,
      abbr: row.competition_abbr,
      accent: row.competition_accent,
      kind: row.competition_kind,
    },
    seasonId: row.season_id,
    stage: row.stage,
    round: row.round_label,
    matchday: row.matchday,
    kickoff: row.kickoff_utc,
    status: row.status,
    statusDetail: row.status_detail,
    minute: row.minute,
    minuteDisplay: row.minute_display,
    score: {
      home: row.home_score, away: row.away_score,
      halftime: row.home_score_ht == null ? null : { home: row.home_score_ht, away: row.away_score_ht },
      penalties: row.home_pens == null ? null : { home: row.home_pens, away: row.away_pens },
    },
    winnerTeamId: row.winner_team_id,
    home: {
      id: row.home_team_id, name: row.home_name, short: row.home_short, code: row.home_code,
      crest: row.home_crest, color: row.home_color, color2: row.home_color2,
    },
    away: {
      id: row.away_team_id, name: row.away_name, short: row.away_short, code: row.away_code,
      crest: row.away_crest, color: row.away_color, color2: row.away_color2,
    },
    venue: row.venue,
    attendance: row.attendance,
    referee: row.referee,
    broadcaster: row.broadcaster,
    hasLineups: !!row.has_lineups,
    hasStats: !!row.has_stats,
    updatedAt: row.updated_at,
  };
}

export const teamJson = (t) => t && ({
  id: t.id, name: t.name, fullName: t.full_name, short: t.short_name, code: t.code,
  city: t.city, stadium: t.stadium, founded: t.founded, country: t.country,
  crest: t.crest_url, color: t.primary_color, color2: t.secondary_color,
  isNational: !!t.is_national,
});

export const eventJson = (e) => ({
  id: e.id, type: e.type, minute: e.minute, minuteExtra: e.minute_extra,
  minuteDisplay: e.minute_display || (e.minute != null ? `${e.minute}'` : null),
  teamId: e.team_id, player: e.player_name, assist: e.assist_name, related: e.related_name,
  score: e.home_score == null ? null : { home: e.home_score, away: e.away_score },
  detail: e.detail,
});

export const listTeamsJson = () =>
  getDb().prepare(`SELECT ${TEAM_COLUMNS} FROM teams t ORDER BY t.name`).all()
    .map((t) => ({
      id: t.id, name: t.name, short: t.short_name, code: t.code, city: t.city,
      crest: t.crest_url, color: t.primary_color, color2: t.secondary_color,
    }));

export const competitionJson = (c, locale = 'nl') => ({
  id: c.id,
  name: locale === 'en' ? c.name_en : c.name_nl,
  short: c.short_name,
  abbr: c.abbr,
  kind: c.kind,
  tier: c.tier,
  country: c.country,
  accent: c.accent,
  hasTable: !!c.has_table,
  order: c.sort_order,
});
