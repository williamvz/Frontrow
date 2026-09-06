// Configuration comes from three places, in this order of precedence:
//   1. environment variables (set by run.sh from the add-on options, or by
//      docker-compose when running standalone);
//   2. the `settings` table, which is what the app itself writes when you
//      change something in Instellingen;
//   3. the defaults below.
// Anything a user can change in the UI lives in the database, not here.

import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const bool = (v, fallback = false) => {
  if (v === undefined || v === null || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
};

const list = (v, fallback = []) =>
  (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : fallback);

export const config = {
  port: Number(process.env.PORT || 8199),
  dbPath: process.env.DB_PATH || path.join(here, '../../.data/frontrow.db'),
  publicDir: process.env.PUBLIC_DIR || path.join(here, '../public'),

  locale: process.env.LANGUAGE === 'en' ? 'en' : 'nl',
  timezone: process.env.TZ || 'Europe/Amsterdam',
  favouriteTeam: process.env.FAVOURITE_TEAM || 'ajax',
  competitions: list(process.env.COMPETITIONS, [
    'eredivisie', 'kkd', 'knvb_beker', 'johan_cruijff_schaal', 'oranje',
  ]),

  demoMode: bool(process.env.DEMO_MODE),
  logLevel: process.env.LOG_LEVEL || 'info',

  goalNotifications: bool(process.env.GOAL_NOTIFICATIONS, true),
  haNotifyService: process.env.HA_NOTIFY_SERVICE || '',
  vapidContact: process.env.VAPID_CONTACT || '',
  haGoalEvent: bool(process.env.HA_GOAL_EVENT, true),

  // Present only inside a Home Assistant add-on; enables the Supervisor API.
  supervisorToken: process.env.SUPERVISOR_TOKEN || '',
  underSupervisor: bool(process.env.RUNNING_UNDER_SUPERVISOR),

  // Polling cadence.
  //
  // The incumbents are 15-25s behind the stadium; a two-minute poll would feel
  // visibly broken next to them. So: 20s while a followed team is playing,
  // 60s while anything else is live, and long naps otherwise. Crucially, a
  // live tick only asks the providers about competitions that actually have a
  // match on — nine idle competitions cost nothing.
  poll: {
    hotSeconds: Number(process.env.POLL_HOT_SECONDS || 20),
    liveSeconds: Number(process.env.POLL_LIVE_SECONDS || 60),
    soonSeconds: Number(process.env.POLL_SOON_SECONDS || 300),
    idleSeconds: Number(process.env.POLL_IDLE_SECONDS || 1800),
    // How long before kickoff a match counts as "soon" (fast polling starts).
    preKickoffMinutes: 15,
    // How long after the 90th we keep polling a match that has not gone final.
    postFulltimeMinutes: 40,
  },

  providers: list(process.env.PROVIDERS, ['espn', 'sportsdb']),
  // ESPN's edge answers tool-shaped User-Agents and refuses browser-shaped
  // ones (see providers/espn.js). A descriptive "Frontrow/1.0 (…)" string is
  // precisely what gets a 403, so the default is a plain curl token. Override
  // with PROVIDER_USER_AGENT if a provider ever asks for something specific.
  userAgent: process.env.PROVIDER_USER_AGENT || 'curl/8.7.1',
};

export default config;
