// Club crests, proxied and cached.
//
// The crest images live on ESPN's CDN. Letting the browser fetch them directly
// would mean every phone in the house makes a third-party request on every
// screen — the exact thing Frontrow exists to avoid — and it would break the
// moment ESPN changed a URL. So the Pi fetches each crest once, keeps it on
// disk next to the database, and serves it from there forever after. Offline,
// it still works.

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import * as repo from '../db/repo.js';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('crest');
export const router = express.Router();

const CACHE_DIR = path.join(path.dirname(config.dbPath), 'crests');
fs.mkdirSync(CACHE_DIR, { recursive: true });

const inFlight = new Map();

/** A crest drawn from the club's own colours, for when there is no image. */
function monogram(team) {
  const label = (team?.code || team?.short_name || team?.name || '?').slice(0, 3).toUpperCase();
  const fill = team?.primary_color || '#2C231E';
  const ink = team?.secondary_color && team.secondary_color !== fill ? team.secondary_color : '#FFFFFF';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="${label}">
  <rect width="64" height="64" fill="${fill}"/>
  <text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${label.length > 2 ? 22 : 28}" font-weight="800" fill="${ink}">${label}</text>
</svg>`;
}

async function download(url, file) {
  const res = await fetch(url, {
    headers: { 'User-Agent': config.userAgent, Accept: 'image/*' },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`crest ${res.status}`);
  const type = res.headers.get('content-type') || '';
  if (!/^image\//.test(type)) throw new Error(`crest not an image (${type})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 512 * 1024) throw new Error('crest too large');
  await fs.promises.writeFile(file, buf);
  return { buf, type };
}

router.get('/:teamId', async (req, res) => {
  const team = repo.getTeam(req.params.teamId);
  if (!team) return res.status(404).end();

  const safe = req.params.teamId.replace(/[^a-z0-9_-]/gi, '');
  const file = path.join(CACHE_DIR, `${safe}.img`);

  // Crests change roughly never, so a year is a fair cache lifetime.
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (fs.existsSync(file)) {
    res.type(sniff(file));
    return fs.createReadStream(file).pipe(res);
  }

  if (team.crest_url) {
    try {
      if (!inFlight.has(safe)) inFlight.set(safe, download(team.crest_url, file));
      const { buf, type } = await inFlight.get(safe);
      res.type(type);
      return res.end(buf);
    } catch (err) {
      log.debug(`${team.id}: ${err.message}`);
    } finally {
      inFlight.delete(safe);
    }
  }

  // No image, or the download failed: draw one. Not cached to disk, because a
  // real crest may still arrive on the next sync.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('image/svg+xml');
  return res.end(monogram(team));
});

function sniff(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(4);
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  if (head[0] === 0x89 && head[1] === 0x50) return 'image/png';
  if (head[0] === 0xff && head[1] === 0xd8) return 'image/jpeg';
  if (head.toString('utf8', 0, 4) === '<svg' || head.toString('utf8', 0, 2) === '<?') return 'image/svg+xml';
  return 'image/png';
}

export default router;
