// One SQLite file, opened once, shared by the whole process. better-sqlite3 is
// synchronous, which is exactly right here: every query is a sub-millisecond
// read against a database that fits in the Pi's page cache, and it keeps the
// sync engine free of await-soup.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../config.js';
import { logger } from '../util/log.js';

const log = logger('db');
const here = path.dirname(fileURLToPath(import.meta.url));

let db = null;

export function getDb() {
  if (db) return db;

  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(schema);
  log.info(`database ready at ${config.dbPath}`);
  return db;
}

/** Close and forget the handle — only used by tests. */
export function closeDb() {
  if (db) { db.close(); db = null; }
}

// --------------------------------------------------------------- settings kv
export function getSetting(key, fallback = null) {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return row.value; }
}

export function setSetting(key, value) {
  getDb().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value));
  return value;
}

/**
 * Run a function inside a transaction. better-sqlite3 transactions cannot
 * contain async work, which is deliberate — every writer here is synchronous.
 */
export const tx = (fn) => getDb().transaction(fn);
