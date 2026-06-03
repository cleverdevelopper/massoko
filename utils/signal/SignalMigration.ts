/**
 * SignalMigration.ts
 *
 * ONE-TIME, IDEMPOTENT migration that copies Signal data from
 * AsyncStorage into SQLite.  Identity keys remain in SecureStore —
 * they are NEVER touched here.
 *
 * Safety guarantees:
 *  - Reads the `sqlite_migrated` flag from app_settings before doing anything.
 *  - If already set, returns immediately (idempotent).
 *  - Never writes to SecureStore for identityKey / registrationId.
 *  - Never deletes data from AsyncStorage (read-only migration).
 *  - Never regenerates keys.
 *  - Never destroys existing sessions.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDB, getSetting, setSetting } from '../database';
import { Buffer } from 'buffer';

const MIGRATION_FLAG = 'sqlite_migrated';

export async function runSignalMigration(): Promise<void> {
  const alreadyMigrated = await getSetting(MIGRATION_FLAG);
  if (alreadyMigrated === 'true') {
    console.log('[MIGRATION] Already migrated. Skipping.');
    return;
  }

  console.log('[MIGRATION] Starting one-time Signal data migration...');
  const db = getDB();

  try {
    let allKeys: readonly string[] = [];
    try {
      allKeys = await AsyncStorage.getAllKeys();
    } catch (e) {
      console.warn('[MIGRATION] Could not read AsyncStorage keys:', e);
    }

    let migratedSessions = 0;
    let migratedPrekeys = 0;
    let migratedSignedPrekeys = 0;

    for (const key of allKeys) {
      // ─── Sessions ────────────────────────────────────────────────
      if (key.startsWith('session_')) {
        const address = key.replace(/^session_/, '');
        try {
          const val = await AsyncStorage.getItem(key);
          if (val) {
            await db.runAsync(
              `INSERT OR IGNORE INTO signal_sessions (address, session_data, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)`,
              [address, val]
            );
            migratedSessions++;
          }
        } catch (e) {
          console.warn(`[MIGRATION] Failed to migrate session ${key}:`, e);
        }
      }

      // ─── PreKey public halves ─────────────────────────────────────
      if (key.startsWith('preKeyPub_')) {
        const keyId = key.replace(/^preKeyPub_/, '');
        try {
          const pubVal = await AsyncStorage.getItem(key);
          const privVal = await AsyncStorage.getItem(`preKeyPriv_${keyId}`);
          if (pubVal && privVal) {
            await db.runAsync(
              `INSERT OR IGNORE INTO signal_prekeys
                 (prekey_id, public_key, private_key)
               VALUES (?, ?, ?)`,
              [parseInt(keyId, 10), pubVal, privVal]
            );
            migratedPrekeys++;
          }
        } catch (e) {
          console.warn(`[MIGRATION] Failed to migrate prekey ${key}:`, e);
        }
      }

      // ─── Signed PreKey public halves ─────────────────────────────
      if (key.startsWith('signedPreKeyPub_')) {
        const keyId = key.replace(/^signedPreKeyPub_/, '');
        try {
          const pubVal = await AsyncStorage.getItem(key);
          const privVal = await AsyncStorage.getItem(`signedPreKeyPriv_${keyId}`);
          // Signature is not stored in AS in the old implementation —
          // we store an empty placeholder so the row exists.
          if (pubVal && privVal) {
            await db.runAsync(
              `INSERT OR IGNORE INTO signal_signed_prekeys
                 (signed_prekey_id, public_key, private_key, signature)
               VALUES (?, ?, ?, '')`,
              [parseInt(keyId, 10), pubVal, privVal]
            );
            migratedSignedPrekeys++;
          }
        } catch (e) {
          console.warn(`[MIGRATION] Failed to migrate signed prekey ${key}:`, e);
        }
      }

      // ─── Trusted identities ───────────────────────────────────────
      if (key.startsWith('identityKey_') && !key.endsWith('_pubKey') && !key.endsWith('_privKey')) {
        const address = key.replace(/^identityKey_/, '');
        try {
          const val = await AsyncStorage.getItem(key);
          if (val) {
            await db.runAsync(
              `INSERT OR IGNORE INTO signal_trusted_identities
                 (address, identity_key, updated_at)
               VALUES (?, ?, CURRENT_TIMESTAMP)`,
              [address, val]
            );
          }
        } catch (e) {
          console.warn(`[MIGRATION] Failed to migrate identity ${key}:`, e);
        }
      }
    }

    await setSetting(MIGRATION_FLAG, 'true');
    console.log(
      `[MIGRATION] Done. sessions=${migratedSessions}, prekeys=${migratedPrekeys}, signedPrekeys=${migratedSignedPrekeys}`
    );
  } catch (err) {
    // Do NOT set the flag — let it retry next launch.
    console.error('[MIGRATION] Migration failed, will retry next launch:', err);
  }
}
