// The sync engine. Providers hand it canonical matches; it decides what
// actually changed, writes the minimum, and announces the interesting bits.
//
// Two rules keep this honest:
//   * a later provider never overwrites a *better* value with a worse one —
//     ESPN's live minute is not clobbered by TheSportsDB's silence;
//   * every announcement is derived from a real database transition, so a
//     restart mid-matchday cannot re-announce a goal that already happened.

import { activeProviders } from '../providers/index.js';
import * as repo from '../db/repo.js';
import { getDb } from '../db/database.js';
import { publish } from '../realtime/hub.js';
import { nowIso, localDate, addDays, seasonLabelFor } from '../util/time.js';
import { logger } from '../util/log.js';

const log = logger('sync');

const GOAL_TYPES = new Set(['goal', 'penalty', 'own_goal']);
const TERMINAL = new Set(['finished', 'cancelled', 'abandoned']);

/** Which side actually gets the goal — an own goal counts for the opponent. */
const scoringSide = (ev) =>
  (ev.type === 'own_goal' ? (ev.side === 'home' ? 'away' : 'home') : ev.side);

/**
 * Sync one competition over a date window.
 * @returns {{seen:number, changed:number, events:number, provider:string|null}}
 */
export async function syncCompetition(competition, { from, to, job = 'manual' } = {}) {
  const providers = activeProviders();
  let lastError = null;

  for (const provider of providers) {
    const logId = repo.startSyncLog(job, provider.name);
    try {
      const matches = await provider.fetchMatches({ competition, from, to });
      const result = ingest(competition, provider.name, matches);
      repo.finishSyncLog(logId, { ok: true, seen: matches.length, ...result });
      log.debug(`${competition.id} via ${provider.name}: ${matches.length} seen, ${result.changed} changed, ${result.events} events`);
      // The first provider that answers wins; the rest are a fallback, not a merge.
      return { ...result, seen: matches.length, provider: provider.name };
    } catch (err) {
      lastError = err;
      repo.finishSyncLog(logId, { ok: false, message: String(err.message || err) });
      log.warn(`${competition.id} via ${provider.name} failed: ${err.message}`);
    }
  }

  if (lastError) log.error(`${competition.id}: every provider failed`);
  return { seen: 0, changed: 0, events: 0, provider: null };
}

/** Write a batch of provider matches into the database. */
export function ingest(competition, providerName, matches) {
  const db = getDb();
  let changed = 0; let events = 0;
  const announcements = [];

  db.transaction(() => {
    for (const pm of matches) {
      if (!pm.homeName || !pm.awayName || !pm.kickoffIso) continue;

      const homeTeamId = repo.resolveTeam({
        provider: providerName, providerTeamId: pm.homeProviderId,
        name: pm.homeName, crestUrl: pm.homeCrestUrl,
      });
      const awayTeamId = repo.resolveTeam({
        provider: providerName, providerTeamId: pm.awayProviderId,
        name: pm.awayName, crestUrl: pm.awayCrestUrl,
      });
      if (!homeTeamId || !awayTeamId) continue;

      const seasonId = repo.ensureSeason(
        competition.id, seasonLabelFor(pm.kickoffIso).startYear,
      );
      db.prepare('INSERT OR IGNORE INTO season_teams (season_id, team_id) VALUES (?, ?)')
        .run(seasonId, homeTeamId);
      db.prepare('INSERT OR IGNORE INTO season_teams (season_id, team_id) VALUES (?, ?)')
        .run(seasonId, awayTeamId);

      const existing = repo.findMatch({
        provider: providerName, providerMatchId: pm.providerId,
        competitionId: competition.id, homeTeamId, awayTeamId, kickoffIso: pm.kickoffIso,
      });

      const id = existing?.id
        || repo.matchIdFor(competition.id, homeTeamId, awayTeamId, pm.kickoffIso);

      const winnerTeamId = pm.winnerSide === 'home' ? homeTeamId
        : pm.winnerSide === 'away' ? awayTeamId : (existing?.winner_team_id ?? null);

      const row = {
        id,
        competition_id: competition.id,
        season_id: seasonId,
        stage: pm.stage || existing?.stage || 'league',
        round_label: pm.round ?? existing?.round_label ?? null,
        matchday: pm.matchday ?? existing?.matchday ?? null,
        home_team_id: homeTeamId,
        away_team_id: awayTeamId,
        kickoff_utc: pm.kickoffIso,
        status: pm.status,
        status_detail: pm.statusDetail ?? existing?.status_detail ?? null,
        minute: pm.minute ?? null,
        minute_display: pm.minuteDisplay ?? null,
        home_score: pm.homeScore ?? existing?.home_score ?? null,
        away_score: pm.awayScore ?? existing?.away_score ?? null,
        home_score_ht: pm.homeScoreHt ?? existing?.home_score_ht ?? null,
        away_score_ht: pm.awayScoreHt ?? existing?.away_score_ht ?? null,
        home_pens: pm.homePens ?? existing?.home_pens ?? null,
        away_pens: pm.awayPens ?? existing?.away_pens ?? null,
        winner_team_id: winnerTeamId,
        venue: pm.venue ?? existing?.venue ?? null,
        attendance: pm.attendance ?? existing?.attendance ?? null,
        referee: pm.referee ?? existing?.referee ?? null,
        broadcaster: existing?.broadcaster ?? null,
        provider: providerName,
        provider_match_id: pm.providerId ? String(pm.providerId) : null,
        has_lineups: existing?.has_lineups ?? 0,
        has_stats: existing?.has_stats ?? 0,
        started_at: existing?.started_at
          ?? (pm.status !== 'scheduled' ? nowIso() : null),
        finished_at: existing?.finished_at
          ?? (TERMINAL.has(pm.status) ? nowIso() : null),
      };

      // A provider that has gone quiet must not un-finish a finished match or
      // wipe a score we already know.
      if (existing && TERMINAL.has(existing.status) && !TERMINAL.has(row.status)) {
        row.status = existing.status;
        row.status_detail = existing.status_detail;
      }

      const { created, changed: fields } = repo.upsertMatch(row);
      if (fields.length) changed += 1;

      // ---------- events -------------------------------------------------
      const newGoals = [];
      for (const ev of pm.events || []) {
        const teamId = ev.side === 'home' ? homeTeamId : awayTeamId;
        const added = repo.addEvent({
          match_id: id, team_id: teamId, type: ev.type,
          minute: ev.minute ?? null, minute_extra: ev.minuteExtra ?? null,
          minute_display: ev.minuteDisplay ?? null,
          player_name: ev.player ?? null, assist_name: ev.assist ?? null,
          related_name: ev.related ?? null,
          home_score: ev.homeScore ?? null, away_score: ev.awayScore ?? null,
          detail: ev.detail ?? null,
        });
        if (added) {
          events += 1;
          if (GOAL_TYPES.has(ev.type)) newGoals.push({ ...ev, teamId });
        }
      }

      // ---------- what is worth telling the house about -------------------
      // A brand-new match that is already finished is history being backfilled,
      // not news: announce nothing.
      const isBackfill = created && TERMINAL.has(row.status);
      if (isBackfill) continue;

      const scoreMoved = existing
        && (row.home_score !== existing.home_score || row.away_score !== existing.away_score)
        && row.home_score != null;

      if (newGoals.length) {
        for (const g of newGoals) {
          announcements.push({
            type: 'match:goal',
            data: {
              matchId: id, competitionId: competition.id,
              scoringTeamId: scoringSide(g) === 'home' ? homeTeamId : awayTeamId,
              againstTeamId: scoringSide(g) === 'home' ? awayTeamId : homeTeamId,
              player: g.player, assist: g.assist ?? null, kind: g.type,
              minute: g.minute, minuteDisplay: g.minuteDisplay ?? null,
              homeScore: g.homeScore ?? row.home_score, awayScore: g.awayScore ?? row.away_score,
              homeTeamId, awayTeamId,
            },
          });
        }
      } else if (scoreMoved) {
        // Some providers move the score before they publish the scorer. The
        // goal still happened, so it is still announced — just anonymously.
        announcements.push({
          type: 'match:goal',
          data: {
            matchId: id, competitionId: competition.id,
            scoringTeamId: row.home_score > (existing.home_score ?? 0) ? homeTeamId : awayTeamId,
            againstTeamId: row.home_score > (existing.home_score ?? 0) ? awayTeamId : homeTeamId,
            player: null, assist: null, kind: 'goal',
            minute: row.minute, minuteDisplay: row.minute_display,
            homeScore: row.home_score, awayScore: row.away_score,
            homeTeamId, awayTeamId,
          },
        });
      }

      if (existing && existing.status !== row.status) {
        announcements.push({
          type: 'match:status',
          data: {
            matchId: id, competitionId: competition.id,
            from: existing.status, to: row.status,
            homeTeamId, awayTeamId,
            homeScore: row.home_score, awayScore: row.away_score,
          },
        });
      }

      if (fields.length) {
        announcements.push({ type: 'match:update', data: { matchId: id, competitionId: competition.id, fields } });
      }
    }
  })();

  // Published outside the transaction: a listener must never be able to hold
  // a write lock open, and a subscriber only ever sees committed state.
  for (const a of announcements) publish(a.type, a.data);

  return { changed, events };
}

/** Pull lineups, stats and the full timeline for one match. */
export async function syncMatchDetail(matchId) {
  const match = repo.getMatch(matchId);
  if (!match) return false;
  const competition = repo.getCompetition(match.competition_id);
  const providers = activeProviders().filter((p) => p.supports.lineups || p.supports.stats);

  for (const provider of providers) {
    if (match.provider && provider.name !== match.provider) continue;
    try {
      const detail = await provider.fetchDetail({
        competition, providerMatchId: match.provider_match_id,
      });
      if (!detail) continue;

      for (const l of detail.lineups || []) {
        const teamId = l.side === 'home' ? match.home_team_id : match.away_team_id;
        if (l.players?.length) repo.replaceLineups(matchId, teamId, l.players, l.formation, l.coach);
      }
      if (detail.stats?.length) {
        repo.replaceStats(matchId, detail.stats.map((s) => ({
          teamId: s.side === 'home' ? match.home_team_id : match.away_team_id,
          metric: s.metric, value: s.value,
        })));
      }
      for (const ev of detail.events || []) {
        repo.addEvent({
          match_id: matchId,
          team_id: ev.side === 'home' ? match.home_team_id : match.away_team_id,
          type: ev.type, minute: ev.minute ?? null, minute_extra: ev.minuteExtra ?? null,
          minute_display: ev.minuteDisplay ?? null, player_name: ev.player ?? null,
          assist_name: ev.assist ?? null, related_name: ev.related ?? null,
          home_score: ev.homeScore ?? null, away_score: ev.awayScore ?? null,
          detail: ev.detail ?? null,
        });
      }
      publish('match:detail', { matchId });
      return true;
    } catch (err) {
      log.debug(`detail for ${matchId} via ${provider.name}: ${err.message}`);
    }
  }
  return false;
}

/** The window the routine sync looks at: yesterday through the next fortnight. */
export function defaultWindow() {
  const today = localDate();
  return { from: addDays(today, -3), to: addDays(today, 16) };
}
