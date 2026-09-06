// Frontrow — the server.
//
// One process does everything: it serves the built React app, answers the API,
// holds the SSE stream open, runs the sync engine on its own adaptive clock and
// talks to Home Assistant. On a Pi 5 that is a few dozen megabytes of RSS and
// essentially no CPU between matchdays.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import config from './config.js';
import { getDb } from './db/database.js';
import * as repo from './db/repo.js';
import { router as api } from './routes/api.js';
import * as scheduler from './sync/scheduler.js';
import * as notify from './services/notify.js';
import * as ha from './services/ha.js';
import * as replay from './providers/replay.js';
import { bus } from './realtime/hub.js';
import { MATCH_SELECT } from './routes/serialize.js';
import { logger } from './util/log.js';

const log = logger('server');
const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);   // Home Assistant's ingress sits in front of us
app.use(express.json({ limit: '256kb' }));

// Home Assistant tells us who is looking, which is how the app can greet the
// right family member without ever asking anyone to log in.
app.use((req, res, next) => {
  const haUser = req.get('X-Remote-User-Display-Name') || req.get('X-Remote-User-Name');
  if (haUser) req.haUser = haUser;
  next();
});

app.use('/api', api);

// ------------------------------------------------------------ the built app
const publicDir = config.publicDir;
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir, {
    // The bundle is content-hashed and immutable; index.html never is.
    setHeaders: (res, file) => {
      if (file.endsWith('index.html') || file.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else if (/\.[0-9a-f]{8,}\./.test(path.basename(file))) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    },
  }));
  // Hash routing means there is only ever one HTML document to serve.
  app.get(/.*/, (req, res) => res.sendFile(path.join(publicDir, 'index.html')));
} else {
  log.warn(`no frontend build at ${publicDir} — API only (run 'npm run build' in frontend/)`);
  app.get('/', (req, res) => res.json({ ok: true, note: 'Frontrow API — frontend not built' }));
}

// ---------------------------------------------------------------- lifecycle
function publishHaState() {
  if (!ha.isAvailable()) return;
  const db = getDb();
  const live = db.prepare(`${MATCH_SELECT} WHERE m.status IN ('live','halftime')
                           ORDER BY m.kickoff_utc`).all();
  const next = db.prepare(`${MATCH_SELECT} WHERE m.status = 'scheduled'
                           ORDER BY m.kickoff_utc LIMIT 1`).get();
  const profile = repo.getProfile('default');
  const favId = profile?.favourite_team_id;
  const fav = favId && db.prepare(`${MATCH_SELECT}
      WHERE (m.home_team_id = ? OR m.away_team_id = ?)
        AND m.kickoff_utc > datetime('now', '-4 hours')
      ORDER BY m.kickoff_utc LIMIT 1`).get(favId, favId);

  ha.publishState({
    live,
    syncedAt: new Date().toISOString(),
    nextMatch: next ? {
      summary: `${next.home_short} – ${next.away_short}`,
      kickoff: next.kickoff_utc, competition: next.competition_name,
    } : null,
    favourite: fav ? {
      team_name: repo.getTeam(favId)?.name,
      summary: fav.status === 'scheduled'
        ? `${fav.home_short} – ${fav.away_short}`
        : `${fav.home_short} ${fav.home_score ?? 0}-${fav.away_score ?? 0} ${fav.away_short}`,
      status: fav.status,
      score: fav.home_score == null ? null : `${fav.home_score}-${fav.away_score}`,
      minute: fav.minute_display || fav.minute,
      opponent: fav.home_team_id === favId ? fav.away_name : fav.home_name,
      kickoff: fav.kickoff_utc,
      competition: fav.competition_name,
    } : null,
  }).catch(() => {});
}

function boot() {
  getDb();
  repo.seed();
  notify.start();

  if (config.demoMode) {
    replay.start();
    log.info('🎬 demo mode — replaying a scripted Eredivisie matchday');
  }

  scheduler.start();

  // Keep the Home Assistant entities in step with the app, but no more often
  // than the data actually changes.
  bus.on('sync', publishHaState);
  publishHaState();

  const server = app.listen(config.port, () => {
    log.info(`⚽ Frontrow listening on :${config.port}`);
    log.info(`   competities: ${repo.listCompetitions().map((c) => c.short_name).join(', ')}`);
    if (ha.isAvailable()) log.info('   Home Assistant API: connected');
  });

  const shutdown = (signal) => {
    log.info(`${signal} — shutting down`);
    scheduler.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

// Importing the module (from a test) must not start the world.
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  boot();
}

export { app, boot };
