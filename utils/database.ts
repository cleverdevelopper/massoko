/**
 * database.ts
 * Central SQLite database initializer for Massoko.
 * Opens the DB and creates all tables using CREATE TABLE IF NOT EXISTS
 * so it is fully idempotent and safe to run on every app start.
 */
import * as SQLite from 'expo-sqlite';

let _db: SQLite.SQLiteDatabase | null = null;

export function getDB(): SQLite.SQLiteDatabase {
  if (!_db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return _db;
}

export async function initDatabase(): Promise<void> {
  _db = await SQLite.openDatabaseAsync('massoko.db');

  await _db.execAsync(`PRAGMA journal_mode = WAL;`);

  await _db.execAsync(`
    -- =============================================
    -- Signal Protocol Tables
    -- =============================================

    CREATE TABLE IF NOT EXISTS signal_prekeys (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      prekey_id     INTEGER NOT NULL UNIQUE,
      public_key    TEXT NOT NULL,
      private_key   TEXT NOT NULL,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_signed_prekeys (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      signed_prekey_id INTEGER NOT NULL UNIQUE,
      public_key      TEXT NOT NULL,
      private_key     TEXT NOT NULL,
      signature       TEXT NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_sessions (
      address       TEXT PRIMARY KEY,
      session_data  TEXT NOT NULL,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_trusted_identities (
      address       TEXT PRIMARY KEY,
      identity_key  TEXT NOT NULL,
      updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_sender_keys (
      group_id    TEXT NOT NULL,
      sender_id   TEXT NOT NULL,
      sender_key  TEXT NOT NULL,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (group_id, sender_id)
    );

    -- =============================================
    -- Local Message Storage
    -- =============================================

    CREATE TABLE IF NOT EXISTS local_conversations (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      server_conversation_id TEXT NOT NULL UNIQUE,
      title                 TEXT,
      avatar                TEXT,
      updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS local_participants (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      UNIQUE(conversation_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS local_messages (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      server_message_id   TEXT UNIQUE,
      conversation_id     TEXT NOT NULL,
      sender_id           TEXT NOT NULL,
      encrypted_content   TEXT NOT NULL,
      decrypted_content   TEXT,
      is_decrypted        INTEGER DEFAULT 0,
      signal_message_type INTEGER,
      message_type        TEXT DEFAULT 'text',
      sent_at             DATETIME,
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_local_messages_conv
      ON local_messages(conversation_id, sent_at);
  `);

  // Run dynamic schema migrations
  try {
    await _db.execAsync(`ALTER TABLE local_messages ADD COLUMN is_decrypted INTEGER DEFAULT 0;`);
    console.log('[DB] Added column is_decrypted to local_messages.');
  } catch (e) {
    // Column already exists, ignore
  }

  await _db.execAsync(`

    -- =============================================
    -- Queues and Receipts
    -- =============================================

    CREATE TABLE IF NOT EXISTS outgoing_message_queue (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      local_id            TEXT NOT NULL UNIQUE,
      conversation_id     TEXT NOT NULL,
      encrypted_content   TEXT NOT NULL,
      signal_message_type INTEGER NOT NULL,
      status              TEXT DEFAULT 'pending',
      created_at          DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS pending_uploads (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      local_message_id TEXT NOT NULL,
      status          TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS pending_downloads (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      attachment_id TEXT NOT NULL,
      status        TEXT DEFAULT 'pending'
    );

    CREATE TABLE IF NOT EXISTS message_receipts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id    TEXT NOT NULL UNIQUE,
      delivered_at  DATETIME,
      read_at       DATETIME
    );

    -- =============================================
    -- App Metadata
    -- =============================================

    CREATE TABLE IF NOT EXISTS app_settings (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS cached_users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     TEXT NOT NULL UNIQUE,
      name        TEXT,
      photo       TEXT,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('[DB] Database initialized successfully.');
}

// Convenience helpers for app_settings
export async function getSetting(key: string): Promise<string | null> {
  const db = getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)',
    [key, value]
  );
}
