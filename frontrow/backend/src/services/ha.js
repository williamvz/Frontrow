// Home Assistant integration.
//
// Frontrow is a guest inside HA, so it behaves like one: it publishes a few
// sensors describing what is going on, and it fires an event when something
// happens. It does not try to own automations — firing `frontrow_goal` with
// the club's colours in the payload lets William turn his living room red
// with three lines of YAML, which is far better than us guessing what he wants.
//
// Everything here is best-effort: no Supervisor token (running standalone),
// no problem — the calls are skipped and the app is unaffected.

import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('ha');
const BASE = 'http://supervisor/core/api';

const enabled = () => Boolean(config.supervisorToken);

async function call(path, body, method = 'POST') {
  if (!enabled()) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.supervisorToken}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) { log.debug(`${path} -> ${res.status}`); return null; }
    return res.status === 204 ? true : await res.json().catch(() => true);
  } catch (err) {
    log.debug(`${path} failed: ${err.message}`);
    return null;
  }
}

/**
 * Publish or update a sensor. HA creates the entity on first write, so there
 * is no registration step and nothing to clean up if the add-on is removed.
 */
export const setState = (entityId, state, attributes = {}) =>
  call(`/states/${entityId}`, {
    state: String(state).slice(0, 255),
    attributes: { friendly_name: attributes.friendly_name || entityId, ...attributes },
  });

/**
 * Fire an event on HA's bus. This is the extension point: an automation can
 * trigger on `frontrow_goal` and read the club colours straight from the
 * payload to drive lights, a TTS announcement or a TV.
 */
export const fireEvent = (name, data) => call(`/events/${name}`, data);

/** Call any HA service, e.g. notify.mobile_app_pixel. */
export function callService(service, data) {
  if (!service || !service.includes('.')) return null;
  const [domain, name] = service.split('.', 2);
  return call(`/services/${domain}/${name}`, data);
}

// ------------------------------------------------------------- the entities
export async function publishState({ live, nextMatch, favourite, syncedAt }) {
  if (!enabled()) return;

  await setState('sensor.frontrow_live_matches', live.length, {
    friendly_name: 'Frontrow — live wedstrijden',
    icon: 'mdi:soccer',
    unit_of_measurement: 'wedstrijden',
    matches: live.map((m) => ({
      match: `${m.home_name} ${m.home_score ?? 0}-${m.away_score ?? 0} ${m.away_name}`,
      minute: m.minute_display || m.minute,
      competition: m.competition_id,
    })),
    last_synced: syncedAt,
  });

  if (favourite) {
    await setState('sensor.frontrow_favourite', favourite.summary, {
      friendly_name: `Frontrow — ${favourite.team_name}`,
      icon: 'mdi:star',
      team: favourite.team_name,
      status: favourite.status,
      score: favourite.score,
      minute: favourite.minute,
      opponent: favourite.opponent,
      kickoff: favourite.kickoff,
      competition: favourite.competition,
    });
  }

  await setState('sensor.frontrow_next_match', nextMatch ? nextMatch.summary : 'geen', {
    friendly_name: 'Frontrow — volgende wedstrijd',
    icon: 'mdi:calendar-clock',
    device_class: nextMatch ? 'timestamp' : undefined,
    kickoff: nextMatch?.kickoff ?? null,
    competition: nextMatch?.competition ?? null,
  });
}

/**
 * A goal, announced to the house. The payload deliberately carries the club's
 * brand colours in both hex and RGB so a light automation needs no lookup
 * table of its own.
 */
export function announceGoal(goal) {
  if (!config.haGoalEvent) return null;
  return fireEvent('frontrow_goal', {
    match_id: goal.matchId,
    competition: goal.competitionId,
    team: goal.teamName,
    team_id: goal.scoringTeamId,
    against: goal.againstName,
    scorer: goal.player,
    assist: goal.assist,
    kind: goal.kind,
    minute: goal.minute,
    score: `${goal.homeScore}-${goal.awayScore}`,
    home_team: goal.homeName,
    away_team: goal.awayName,
    is_favourite: goal.isFavourite === true,
    color: goal.color,
    rgb: hexToRgb(goal.color),
    secondary_color: goal.secondaryColor,
    secondary_rgb: hexToRgb(goal.secondaryColor),
    message: goal.player
      ? `${goal.teamName} scoort! ${goal.player} in de ${goal.minute}e minuut. ${goal.homeName} ${goal.homeScore}-${goal.awayScore} ${goal.awayName}.`
      : `${goal.teamName} scoort! ${goal.homeName} ${goal.homeScore}-${goal.awayScore} ${goal.awayName}.`,
  });
}

export function hexToRgb(hex) {
  if (!hex) return null;
  const m = String(hex).replace('#', '');
  if (m.length !== 6) return null;
  return [
    parseInt(m.slice(0, 2), 16),
    parseInt(m.slice(2, 4), 16),
    parseInt(m.slice(4, 6), 16),
  ];
}

export const isAvailable = enabled;
