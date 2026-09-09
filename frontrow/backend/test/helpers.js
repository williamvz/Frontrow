// Every test runs against a throwaway database and the replay provider, so the
// whole suite is deterministic and needs no network at all — which is the point:
// a football app you can only test during a match is a football app you cannot
// test.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function useTempDb(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `frontrow-${name}-`));
  process.env.DB_PATH = path.join(dir, 'test.db');
  process.env.TZ = 'Europe/Amsterdam';
  process.env.DEMO_MODE = '1';
  process.env.LOG_LEVEL = 'error';
  return {
    dir,
    cleanup() { fs.rmSync(dir, { recursive: true, force: true }); },
  };
}

/** A clock the replay provider follows, so a test can jump to the 89th minute. */
export function fakeClock(startMs = Date.UTC(2026, 8, 6, 12, 0, 0)) {
  let now = startMs;
  return {
    now: () => now,
    advanceMinutes(n) { now += n * 60000; return now; },
    set(ms) { now = ms; },
  };
}
