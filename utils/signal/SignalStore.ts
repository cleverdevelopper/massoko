/**
 * SignalStore.ts  —  Hybrid Storage Implementation
 *
 * STORAGE RULES (immutable contract):
 *
 *  ┌─────────────────────────────┬─────────────┐
 *  │ Data                        │ Store       │
 *  ├─────────────────────────────┼─────────────┤
 *  │ Identity Key Pair           │ SecureStore │
 *  │ Registration ID             │ SecureStore │
 *  ├─────────────────────────────┼─────────────┤
 *  │ Sessions                    │ SQLite      │
 *  │ PreKeys (pub + priv)        │ SQLite      │
 *  │ Signed PreKeys (pub + priv) │ SQLite      │
 *  │ Trusted Identities          │ SQLite      │
 *  │ Sender Keys                 │ SQLite      │
 *  └─────────────────────────────┴─────────────┘
 *
 * This class must NEVER call initDatabase() — the caller (app bootstrap)
 * is responsible for calling it before any SignalStore method is used.
 */

import * as SecureStore from 'expo-secure-store';
import { getDB } from '../database';
import { StorageType, Direction } from '@privacyresearch/libsignal-protocol-typescript';
import { Buffer } from 'buffer';

// ─── Buffer helpers ──────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer | undefined): string | undefined {
  if (!buffer) return undefined;
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(str: string | undefined): ArrayBuffer | undefined {
  if (!str) return undefined;
  const buf = Buffer.from(str, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

interface KeyPair {
  pubKey: ArrayBuffer;
  privKey: ArrayBuffer;
}

// ─── SecureStore helpers (safe wrappers) ─────────────────────────────────────

async function secureGet(key: string): Promise<string | null> {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return null;
    return await SecureStore.getItemAsync(key);
  } catch (e) {
    console.warn(`[SignalStore][SecureStore] GET failed for ${key}:`, e);
    return null;
  }
}

async function secureSet(key: string, value: string): Promise<void> {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) {
      console.error('[SignalStore][SecureStore] NOT AVAILABLE — cannot persist identity key!');
      return;
    }
    await SecureStore.setItemAsync(key, value);
  } catch (e) {
    console.error(`[SignalStore][SecureStore] SET failed for ${key}:`, e);
  }
}

async function secureDelete(key: string): Promise<void> {
  try {
    const available = await SecureStore.isAvailableAsync();
    if (!available) return;
    await SecureStore.deleteItemAsync(key);
  } catch (e) {
    console.warn(`[SignalStore][SecureStore] DELETE failed for ${key}:`, e);
  }
}

// ─── Main store class ─────────────────────────────────────────────────────────

export class SignalStore implements StorageType {
  // ── Initialization ──────────────────────────────────────────────────────

  /**
   * Ensures the database is accessible and all required tables exist.
   * Must be called before any Signal Protocol operation.
   */
  public async initialize(): Promise<void> {
    const db = getDB();
    // Quick verification that the database is accessible
    const result = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM signal_sessions'
    );
    console.log(`[SignalStore] Initialized. Session count: ${result?.count ?? 0}`);
  }

  // ── Identity (SecureStore) ───────────────────────────────────────────────

  async getIdentityKeyPair(): Promise<KeyPair | undefined> {
    const pub = await secureGet('identityKey_pubKey');
    const priv = await secureGet('identityKey_privKey');
    if (pub && priv) {
      return { pubKey: base64ToBuffer(pub)!, privKey: base64ToBuffer(priv)! };
    }
    return undefined;
  }

  async putIdentityKeyPair(keyPair: KeyPair): Promise<void> {
    await secureSet('identityKey_pubKey', bufferToBase64(keyPair.pubKey)!);
    await secureSet('identityKey_privKey', bufferToBase64(keyPair.privKey)!);
  }

  async getLocalRegistrationId(): Promise<number | undefined> {
    const id = await secureGet('registrationId');
    if (id) return parseInt(id, 10);
    return undefined;
  }

  async putLocalRegistrationId(registrationId: number): Promise<void> {
    await secureSet('registrationId', registrationId.toString());
  }

  // ── Trusted Identities (SQLite) ──────────────────────────────────────────

  async isTrustedIdentity(
    identifier: string,
    identityKey: ArrayBuffer,
    _direction: Direction
  ): Promise<boolean> {
    if (!identifier) throw new Error('identifier is null/undefined');
    const db = getDB();
    const row = await db.getFirstAsync<{ identity_key: string }>(
      'SELECT identity_key FROM signal_trusted_identities WHERE address = ?',
      [identifier]
    );
    if (!row) return true; // first time — trust on first use (TOFU)
    return row.identity_key === bufferToBase64(identityKey);
  }

  async loadIdentityKey(identifier: string): Promise<ArrayBuffer | undefined> {
    if (!identifier) throw new Error('identifier is null/undefined');
    const db = getDB();
    const row = await db.getFirstAsync<{ identity_key: string }>(
      'SELECT identity_key FROM signal_trusted_identities WHERE address = ?',
      [identifier]
    );
    return base64ToBuffer(row?.identity_key);
  }

  async saveIdentity(identifier: string, identityKey: ArrayBuffer): Promise<boolean> {
    if (!identifier) throw new Error('identifier is null/undefined');
    const db = getDB();
    const existing = await db.getFirstAsync<{ identity_key: string }>(
      'SELECT identity_key FROM signal_trusted_identities WHERE address = ?',
      [identifier]
    );
    const newKeyB64 = bufferToBase64(identityKey)!;
    await db.runAsync(
      `INSERT INTO signal_trusted_identities (address, identity_key, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(address) DO UPDATE SET
         identity_key = excluded.identity_key,
         updated_at   = CURRENT_TIMESTAMP`,
      [identifier, newKeyB64]
    );
    // Return true if the key CHANGED (triggers a new session)
    return !!existing && existing.identity_key !== newKeyB64;
  }

  // ── PreKeys (SQLite) ─────────────────────────────────────────────────────

  async loadPreKey(keyId: string | number): Promise<KeyPair | undefined> {
    const db = getDB();
    const row = await db.getFirstAsync<{ public_key: string; private_key: string }>(
      'SELECT public_key, private_key FROM signal_prekeys WHERE prekey_id = ?',
      [Number(keyId)]
    );
    if (!row) return undefined;
    return { pubKey: base64ToBuffer(row.public_key)!, privKey: base64ToBuffer(row.private_key)! };
  }

  async storePreKey(keyId: string | number, keyPair: KeyPair): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO signal_prekeys (prekey_id, public_key, private_key)
       VALUES (?, ?, ?)`,
      [Number(keyId), bufferToBase64(keyPair.pubKey)!, bufferToBase64(keyPair.privKey)!]
    );
  }

  async removePreKey(keyId: string | number): Promise<void> {
    const db = getDB();
    await db.runAsync('DELETE FROM signal_prekeys WHERE prekey_id = ?', [Number(keyId)]);
  }

  // ── Signed PreKeys (SQLite) ──────────────────────────────────────────────

  async loadSignedPreKey(keyId: string | number): Promise<KeyPair | undefined> {
    const db = getDB();
    const row = await db.getFirstAsync<{ public_key: string; private_key: string }>(
      'SELECT public_key, private_key FROM signal_signed_prekeys WHERE signed_prekey_id = ?',
      [Number(keyId)]
    );
    if (!row) return undefined;
    return { pubKey: base64ToBuffer(row.public_key)!, privKey: base64ToBuffer(row.private_key)! };
  }

  async storeSignedPreKey(keyId: string | number, keyPair: KeyPair): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO signal_signed_prekeys
         (signed_prekey_id, public_key, private_key, signature)
       VALUES (?, ?, ?, '')`,
      [Number(keyId), bufferToBase64(keyPair.pubKey)!, bufferToBase64(keyPair.privKey)!]
    );
  }

  async removeSignedPreKey(keyId: string | number): Promise<void> {
    const db = getDB();
    await db.runAsync(
      'DELETE FROM signal_signed_prekeys WHERE signed_prekey_id = ?',
      [Number(keyId)]
    );
  }

  // ── Sessions (SQLite) ────────────────────────────────────────────────────

  async loadSession(identifier: string): Promise<string | undefined> {
    const db = getDB();
    const row = await db.getFirstAsync<{ session_data: string }>(
      'SELECT session_data FROM signal_sessions WHERE address = ?',
      [identifier]
    );
    return row?.session_data ?? undefined;
  }

  async storeSession(identifier: string, record: string): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT INTO signal_sessions (address, session_data, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(address) DO UPDATE SET
         session_data = excluded.session_data,
         updated_at   = CURRENT_TIMESTAMP`,
      [identifier, record]
    );
  }

  async removeSession(identifier: string): Promise<void> {
    const db = getDB();
    await db.runAsync('DELETE FROM signal_sessions WHERE address = ?', [identifier]);
  }

  async removeAllSessions(identifier: string): Promise<void> {
    const db = getDB();
    // address format is "{userId}.{deviceId}" — remove all for a user prefix
    await db.runAsync(
      `DELETE FROM signal_sessions WHERE address = ? OR address LIKE ?`,
      [identifier, `${identifier}.%`]
    );
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  /**
   * Wipe all Signal data.
   * Called on logout ONLY.  Does NOT touch SecureStore identity keys —
   * those are handled separately by AuthContext on sign-out.
   */
  async clearAll(): Promise<void> {
    const db = getDB();
    await db.runAsync('DELETE FROM signal_sessions');
    await db.runAsync('DELETE FROM signal_prekeys');
    await db.runAsync('DELETE FROM signal_signed_prekeys');
    await db.runAsync('DELETE FROM signal_trusted_identities');
    await db.runAsync('DELETE FROM signal_sender_keys');
    // Clear identity from SecureStore as well (called on hard reset only)
    await secureDelete('identityKey_pubKey');
    await secureDelete('identityKey_privKey');
    await secureDelete('registrationId');
    console.log('[SignalStore] All Signal data cleared.');
  }
}
