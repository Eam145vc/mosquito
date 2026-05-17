// Storage SQLite con encryption AES-256-GCM para refresh_tokens.
//
// Tabla `accounts`:
//   id              TEXT PK   - id interno (ej "demo")
//   email           TEXT      - Gmail address
//   refresh_enc     BLOB      - refresh_token cifrado
//   speaker_id      TEXT      - speaker MQTT (ej "spkr-001")
//   last_history_id TEXT      - ultimo historyId procesado de Gmail API
//   watch_expires   INTEGER   - ms epoch cuando expira el watch
//   created_at, updated_at

import Database from 'better-sqlite3';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from './config.js';

function getKey() {
  if (!config.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY no seteada');
  return Buffer.from(config.ENCRYPTION_KEY, 'base64').subarray(0, 32);
}
function encrypt(plain) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]);
}
function decrypt(buf) {
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(-16);
  const ct = buf.subarray(12, -16);
  const d = createDecipheriv('aes-256-gcm', getKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}

let db = null;

export function openDb() {
  if (db) return db;
  mkdirSync(dirname(config.DB_PATH), { recursive: true });
  db = new Database(config.DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      refresh_enc BLOB NOT NULL,
      speaker_id TEXT,
      last_history_id TEXT,
      watch_expires INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts(email);
  `);

  // Migracion: agregar columnas si la tabla ya existia
  const cols = db.prepare("PRAGMA table_info(accounts)").all().map(c => c.name);
  if (!cols.includes('last_history_id')) {
    db.exec('ALTER TABLE accounts ADD COLUMN last_history_id TEXT');
  }
  if (!cols.includes('watch_expires')) {
    db.exec('ALTER TABLE accounts ADD COLUMN watch_expires INTEGER');
  }

  return db;
}

export function upsertAccount({ id, email, refreshToken, speakerId }) {
  openDb();
  const now = Date.now();
  const enc = encrypt(refreshToken);
  db.prepare(`
    INSERT INTO accounts (id, email, refresh_enc, speaker_id, created_at, updated_at)
    VALUES (@id, @email, @enc, @sp, @now, @now)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      refresh_enc = excluded.refresh_enc,
      speaker_id = excluded.speaker_id,
      updated_at = excluded.updated_at
  `).run({ id, email, enc, sp: speakerId, now });
}

export function getAccount(id) {
  openDb();
  const r = db.prepare('SELECT * FROM accounts WHERE id = ?').get(id);
  if (!r) return null;
  return { ...r, refreshToken: decrypt(r.refresh_enc) };
}

export function getAccountByEmail(email) {
  openDb();
  const r = db.prepare('SELECT * FROM accounts WHERE email = ?').get(email);
  if (!r) return null;
  return { ...r, refreshToken: decrypt(r.refresh_enc) };
}

export function updateAccountHistory(id, historyId) {
  openDb();
  db.prepare('UPDATE accounts SET last_history_id = ?, updated_at = ? WHERE id = ?')
    .run(String(historyId), Date.now(), id);
}

export function updateAccountWatch(id, expirationMs) {
  openDb();
  db.prepare('UPDATE accounts SET watch_expires = ?, updated_at = ? WHERE id = ?')
    .run(expirationMs, Date.now(), id);
}

export function listAccounts() {
  openDb();
  return db.prepare('SELECT id, email, speaker_id, last_history_id, watch_expires, created_at, updated_at FROM accounts').all();
}

export function deleteAccount(id) {
  openDb();
  return db.prepare('DELETE FROM accounts WHERE id = ?').run(id).changes > 0;
}
