// Web push. VAPID keys are generated on first boot and stored in the settings
// table, so there is nothing to configure — which matters, because a key pair
// you have to paste into a config screen is a key pair that never gets set up.
//
// Reality check for a home server: web push needs a secure context. That means
// the Home Assistant ingress URL (HTTPS), a Nabu Casa remote URL, or any
// reverse proxy with a certificate. On a bare http://192.168.x.x the browser
// will refuse to subscribe, and the app says so plainly instead of failing
// silently — see /api/notifications/status.

import webpush from 'web-push';
import { getDb, getSetting, setSetting } from '../db/database.js';
import config from '../config.js';
import { nowIso } from '../util/time.js';
import { hashId } from '../util/text.js';
import { logger } from '../util/log.js';

const log = logger('push');
let ready = false;

export function init() {
  if (ready) return;
  let keys = getSetting('vapid');
  if (!keys?.publicKey) {
    keys = webpush.generateVAPIDKeys();
    setSetting('vapid', keys);
    log.info('generated VAPID keys');
  }
  // Apple's push service rejects a VAPID subject pointing at localhost with
  // BadJwtToken — and web-push only warns about it. The add-on exposes
  // `vapid_contact` so an iPhone household can put a real address here.
  const contact = config.vapidContact && /^mailto:.+@.+\..+/.test(config.vapidContact)
    ? config.vapidContact
    : 'mailto:frontrow@frontrow.invalid';
  if (contact.endsWith('.invalid')) {
    log.warn('geen vapid_contact ingesteld — pushmeldingen op iPhone kunnen geweigerd worden');
  }
  webpush.setVapidDetails(contact, keys.publicKey, keys.privateKey);
  ready = true;
}

export function publicKey() {
  init();
  return getSetting('vapid').publicKey;
}

export function subscribe(profileId, subscription, userAgent) {
  const db = getDb();
  const id = hashId(subscription.endpoint);
  db.prepare(`INSERT INTO push_subscriptions (id, profile_id, endpoint, p256dh, auth, user_agent, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(endpoint) DO UPDATE SET
                profile_id = excluded.profile_id, p256dh = excluded.p256dh,
                auth = excluded.auth, failures = 0`)
    .run(id, profileId, subscription.endpoint, subscription.keys.p256dh,
      subscription.keys.auth, userAgent || null, nowIso());
  return id;
}

export const unsubscribe = (endpoint) =>
  getDb().prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(endpoint);

export const subscriptionsFor = (profileId) =>
  getDb().prepare('SELECT * FROM push_subscriptions WHERE profile_id = ?').all(profileId);

/** Send one payload to every device of one profile. */
export async function sendTo(profileId, payload) {
  init();
  const db = getDb();
  const subs = subscriptionsFor(profileId);
  let sent = 0;

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload),
        { TTL: 900, urgency: 'high' },
      );
      db.prepare('UPDATE push_subscriptions SET last_ok_at = ?, failures = 0 WHERE id = ?')
        .run(nowIso(), s.id);
      sent += 1;
    } catch (err) {
      // 404/410 mean the browser threw the subscription away; drop it rather
      // than retrying it forever.
      if (err.statusCode === 404 || err.statusCode === 410) {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        log.debug('dropped expired subscription');
      } else {
        db.prepare('UPDATE push_subscriptions SET failures = failures + 1 WHERE id = ?').run(s.id);
        log.debug(`push failed (${err.statusCode}): ${err.message}`);
      }
    }
  }));

  return sent;
}

export const deviceCount = () =>
  getDb().prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n;
