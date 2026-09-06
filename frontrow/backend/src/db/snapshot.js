#!/usr/bin/env node
// Written before every Home Assistant backup (config.yaml `backup_pre`).
//
// A hot backup tars /data while the database is open, which for a WAL database
// can archive a torn file. VACUUM INTO writes a single consistent copy that is
// safe to restore, and config.yaml excludes the live files from the archive so
// only this snapshot is stored.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dbPath = process.env.DB_PATH || '/data/frontrow.db';
const target = path.join(path.dirname(dbPath), 'backup', 'frontrow.snapshot.db');

if (!fs.existsSync(dbPath)) {
  console.log('geen database om te back-uppen');
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.rmSync(target, { force: true });

const db = new Database(dbPath, { readonly: true });
try {
  db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
  const { size } = fs.statSync(target);
  console.log(`momentopname geschreven: ${target} (${Math.round(size / 1024)} kB)`);
} finally {
  db.close();
}
