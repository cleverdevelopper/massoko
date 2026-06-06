/**
 * SignalService.ts
 *
 * Business logic layer for all Signal Protocol operations.
 * Now uses SQLite-backed SignalStore exclusively.
 * AsyncStorage is no longer imported.
 *
 * IMMUTABLE RULES:
 *  - Never call generateAndUploadKeys() unless identity is truly absent.
 *  - Never call buildSessionIfNeeded() inside decryptMessage().
 *  - Signal type is embedded as "type:base64" in encrypted_content
 *    so it survives backend transit even if server fields are absent.
 */
import {
  KeyHelper,
  SessionBuilder,
  SessionCipher,
  SignalProtocolAddress,
} from '@privacyresearch/libsignal-protocol-typescript';
import { SignalStore } from './SignalStore';
import axiosInstance from '../axiosInstance';
import { setSetting, getSetting } from '../database';
import { Buffer } from 'buffer';
import { MessageRepository } from '../repositories/MessageRepository';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
  return Buffer.from(buffer).toString('base64');
}

function base64ToBuffer(str: string): ArrayBuffer {
  const buf = Buffer.from(str, 'base64');
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class SignalService {
  private store: SignalStore;
  private DEVICE_ID = 1;

  constructor() {
    this.store = new SignalStore();
  }

  public getStore() {
    return this.store;
  }

  /**
   * Ensures SignalStore is fully initialized before any protocol operations.
   * This method should be called before any encryption/decryption.
   */
  public async initialize(): Promise<void> {
    console.log('[SIGNAL] Initializing SignalStore...');
    try {
      await this.store.initialize();
      console.log('[SIGNAL] SignalStore initialized successfully');
    } catch (error) {
      console.error('[SIGNAL] Failed to initialize SignalStore:', error);
      throw error;
    }
  }

  // ── Key Generation & Upload ────────────────────────────────────────────────

  /**
   * Checks whether keys already exist. If yes, skips generation entirely.
   * If force=true, wipes everything and regenerates (only for hard resets).
   */
  public async generateAndUploadKeys(force = false): Promise<void> {
    const registrationIdExists = await this.store.getLocalRegistrationId();
    const identityKeyExists = await this.store.getIdentityKeyPair();

    if (registrationIdExists && identityKeyExists && !force) {
      console.log('[Signal] Keys already exist. Skipping generation.');
      return;
    }

    console.log(force ? '[Signal] Forcing key regeneration...' : '[Signal] Generating keys for the first time...');

    if (force) {
      await this.store.clearAll();
    }

    await setSetting('signal_version', 'v1');

    const identityKeyPair = await KeyHelper.generateIdentityKeyPair();
    const registrationId = await KeyHelper.generateRegistrationId();
    await this.store.putIdentityKeyPair(identityKeyPair);
    await this.store.putLocalRegistrationId(registrationId);

    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, 1);
    await this.store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);

    const preKeys = [];
    for (let i = 1; i <= 50; i++) {
      const preKey = await KeyHelper.generatePreKey(i);
      preKeys.push(preKey);
      await this.store.storePreKey(preKey.keyId, preKey.keyPair);
    }

    const preKeysPayload = preKeys.map((pk) => ({
      id: pk.keyId,
      key: bufferToBase64(pk.keyPair.pubKey),
    }));

    const storedDeviceId = await getSetting('device_id');
    const deviceId = storedDeviceId ? parseInt(storedDeviceId, 10) : 1;

    const payload = {
      device_id: deviceId,
      registration_id: registrationId,
      identity_key: bufferToBase64(identityKeyPair.pubKey),
      signed_prekey_id: 1,
      signed_prekey: bufferToBase64(signedPreKey.keyPair.pubKey),
      signature: bufferToBase64(signedPreKey.signature),
      prekeys: preKeysPayload,
    };

    await axiosInstance.post('/api/v1/keys', payload);
    console.log('[Signal] Keys uploaded to backend.');
  }

  // ── Session Building ───────────────────────────────────────────────────────

  /**
   * ONLY called from encryptMessage (sender side).
   * NEVER call from decryptMessage — it corrupts the receiver's ratchet.
   */
  public async buildSessionIfNeeded(userId: string | number): Promise<void> {
    const address = new SignalProtocolAddress(userId.toString(), this.DEVICE_ID);
    const existing = await this.store.loadSession(address.toString());
    if (existing) return; // Session already established

    console.log(`[Signal] Fetching key bundle for user ${userId}...`);
    const response = await axiosInstance.get(`/api/v1/users/${userId}/keys`);

    // Backend now returns { bundles: [...] } for multi-device support.
    // We use the first bundle to establish the initial session.
    let bundle = response.data;
    if (bundle.bundles && bundle.bundles.length > 0) {
      bundle = bundle.bundles[0];
    }

    const builder = new SessionBuilder(this.store, address);
    await builder.processPreKey({
      registrationId: bundle.registration_id ?? 1,
      identityKey: base64ToBuffer(bundle.identity_key),
      signedPreKey: {
        keyId: bundle.signed_prekey_id ?? 1,
        publicKey: base64ToBuffer(bundle.signed_prekey),
        signature: base64ToBuffer(bundle.signed_prekey_signature),
      },
      preKey: bundle.prekey
        ? {
            keyId: bundle.prekey.id,
            publicKey: base64ToBuffer(bundle.prekey.public_key),
          }
        : undefined,
    });

    console.log(`[Signal] Session built for user ${userId}.`);
  }

  // ── Encrypt ────────────────────────────────────────────────────────────────

  /**
   * Encrypts a message for the given user.
   * Returns { type, body } where body is "type:base64" — the type is embedded
   * in the payload so it survives backend transit even when server fields fail.
   */
  public async encryptMessage(
    userId: string | number,
    message: string
  ): Promise<{ type: number; body: string }> {
    await this.buildSessionIfNeeded(userId);

    const address = new SignalProtocolAddress(userId.toString(), this.DEVICE_ID);
    const cipher = new SessionCipher(this.store, address);

    const buf = Buffer.from(message, 'utf-8');
    const messageBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const ciphertext = await cipher.encrypt(messageBuffer);

    const bodyStr = ciphertext.body as any;
    const base64Body = Buffer.from(bodyStr, 'binary').toString('base64');
    const signalType = ciphertext.type; // 3 = PreKeyWhisperMessage, 1/2 = WhisperMessage

    console.log(`[ENCRYPT] user=${userId} type=${signalType} len=${base64Body.length}`);

    return {
      type: signalType,
      // Embed type in payload as a "type:base64" prefix — this is the canonical
      // format and must never change without a full migration.
      body: `${signalType}:${base64Body}`,
    };
  }

  // ── Decrypt ────────────────────────────────────────────────────────────────

  /**
   * Decrypts a received ciphertext.
   *
   * CONTRACT (do not violate):
   *  - For type 3 (PreKeyWhisperMessage): session is established INSIDE this call.
   *    Do NOT call buildSessionIfNeeded before this — it creates a conflicting
   *    outgoing session that corrupts the ratchet.
   *  - For type 1/2 (WhisperMessage): session must already exist.
   *  - Never fall back from PreKey → Whisper after a failed PreKey decrypt —
   *    the PreKey call mutates ratchet state even on failure.
   */
  public async decryptMessage(
    userId: string | number,
    ciphertextStr: string,
    type: number
  ): Promise<string> {
    const address = new SignalProtocolAddress(userId.toString(), this.DEVICE_ID);

    // Step 1: Extract embedded type from "type:base64" prefix
    let actualType = type;
    let actualCiphertext = ciphertextStr;

    const colonIdx = ciphertextStr.indexOf(':');
    if (colonIdx > 0 && colonIdx <= 2) {
      const prefix = ciphertextStr.substring(0, colonIdx);
      const parsed = parseInt(prefix, 10);
      if (!isNaN(parsed) && (parsed === 1 || parsed === 2 || parsed === 3)) {
        actualType = parsed;
        actualCiphertext = ciphertextStr.substring(colonIdx + 1);
        console.log(`[DECRYPT] Extracted embedded type: ${actualType}`);
      }
    }

    // Step 2: Validate
    const typeValid = !isNaN(actualType) && (actualType === 1 || actualType === 2 || actualType === 3);
    console.log(
      `[DECRYPT] from=${userId} addr=${address.toString()} ` +
      `type=${actualType} valid=${typeValid} len=${actualCiphertext.length}`
    );

    // Step 3: Decrypt (NEVER call buildSessionIfNeeded here)
    const cipher = new SessionCipher(this.store, address);
    const binaryStr = Buffer.from(actualCiphertext, 'base64').toString('binary');

    let plaintextBuffer: ArrayBuffer;

    if (typeValid && actualType === 3) {
      console.log(`[DECRYPT] decryptPreKeyWhisperMessage → ${address.toString()}`);
      plaintextBuffer = await cipher.decryptPreKeyWhisperMessage(binaryStr, 'binary');
    } else if (typeValid && (actualType === 1 || actualType === 2)) {
      console.log(`[DECRYPT] decryptWhisperMessage → ${address.toString()}`);
      plaintextBuffer = await cipher.decryptWhisperMessage(binaryStr, 'binary');
    } else {
      // Unknown type — try PreKey only (safer fallback, see rule above)
      console.warn(`[DECRYPT] Unknown type (raw=${type} resolved=${actualType}). Trying PreKeyWhisperMessage.`);
      plaintextBuffer = await cipher.decryptPreKeyWhisperMessage(binaryStr, 'binary');
    }

    const plaintext = Buffer.from(plaintextBuffer).toString('utf-8');
    console.log(`[DECRYPT] Success from ${userId}`);
    return plaintext;
  }

  // ── Key Maintenance ────────────────────────────────────────────────────────

  public async checkKeyStatusAndReplenish(): Promise<void> {
    try {
      const storedDeviceId = await getSetting('device_id');
      const deviceId = storedDeviceId ? parseInt(storedDeviceId, 10) : 1;
      const response = await axiosInstance.get(`/api/v1/keys/status?device_id=${deviceId}`);
      if (!response.data.success) return;

      const { status } = response.data;

      if (!status.has_identity_key) {
        console.log('[Signal] Backend missing identity key. Regenerating...');
        await this.generateAndUploadKeys(true);
        return;
      }

      if (status.needs_replenishment) {
        console.log('[Signal] PreKeys low. Replenishing...');
        await this.uploadMorePreKeys();
      }

      if (status.needs_rotation) {
        console.log('[Signal] Signed PreKey expired. Rotating...');
        await this.rotateSignedPreKey();
      }
    } catch (error: any) {
      if (error.message === 'No refresh token available') {
        console.warn('[Signal] Skipping key check — user not authenticated.');
      } else {
        console.error('[Signal] checkKeyStatusAndReplenish failed:', error);
      }
    }
  }

  private async uploadMorePreKeys(): Promise<void> {
    const startId = Math.floor(Date.now() / 1000) % 100000;
    const preKeys = [];

    for (let i = 0; i < 50; i++) {
      const preKey = await KeyHelper.generatePreKey(startId + i);
      preKeys.push(preKey);
      await this.store.storePreKey(preKey.keyId, preKey.keyPair);
    }

    const payload = preKeys.map((pk) => ({
      id: pk.keyId,
      key: bufferToBase64(pk.keyPair.pubKey),
    }));

    const storedDeviceId = await getSetting('device_id');
    const deviceId = storedDeviceId ? parseInt(storedDeviceId, 10) : 1;

    await axiosInstance.post('/api/v1/keys/prekeys', {
      device_id: deviceId,
      prekeys: payload,
    });
    console.log('[Signal] Replenished 50 prekeys.');
  }

  private async rotateSignedPreKey(): Promise<void> {
    const identityKeyPair = await this.store.getIdentityKeyPair();
    const registrationId = await this.store.getLocalRegistrationId();
    if (!identityKeyPair || !registrationId) return;

    const newKeyId = Math.floor(Date.now() / 1000) % 100000;
    const signedPreKey = await KeyHelper.generateSignedPreKey(identityKeyPair, newKeyId);
    await this.store.storeSignedPreKey(signedPreKey.keyId, signedPreKey.keyPair);

    const onePreKey = await KeyHelper.generatePreKey(newKeyId);
    await this.store.storePreKey(onePreKey.keyId, onePreKey.keyPair);

    const storedDeviceId = await getSetting('device_id');
    const deviceId = storedDeviceId ? parseInt(storedDeviceId, 10) : 1;

    const payload = {
      device_id: deviceId,
      registration_id: registrationId,
      identity_key: bufferToBase64(identityKeyPair.pubKey),
      signed_prekey_id: newKeyId,
      signed_prekey: bufferToBase64(signedPreKey.keyPair.pubKey),
      signature: bufferToBase64(signedPreKey.signature),
      prekeys: [{ id: onePreKey.keyId, key: bufferToBase64(onePreKey.keyPair.pubKey) }],
    };

    await axiosInstance.post('/api/v1/keys', payload);
    console.log('[Signal] Signed PreKey rotated.');
  }

  public async clearStore(): Promise<void> {
    await this.store.clearAll();
  }

  /**
   * Recovers any local messages that were saved as encrypted (is_decrypted = 0)
   * and attempts to decrypt them.
   */
  public async recoverUndecryptedMessages(conversationId?: string): Promise<void> {
    console.log(`[DECRYPT_START] Running recoverUndecryptedMessages. convId=${conversationId}`);
    try {
      const undecrypted = await MessageRepository.getUndecryptedMessages(conversationId);
      console.log(`[DECRYPT_START] Found ${undecrypted.length} undecrypted messages to recover.`);

      for (const m of undecrypted) {
        if (m.decrypted_content) {
          console.log(`[DECRYPT_START] Message ${m.id} already has decrypted_content, skipping`);
          await MessageRepository.saveDecrypted(m.server_message_id ?? null, m.id ?? null, m.decrypted_content);
          continue;
        }

        const rawContent = m.encrypted_content;
        const colonIdx = rawContent.indexOf(':');
        let signalType = m.signal_message_type ?? 3;
        if (colonIdx > 0 && colonIdx <= 2) {
          const prefix = rawContent.substring(0, colonIdx);
          const parsed = parseInt(prefix, 10);
          if (!isNaN(parsed) && (parsed === 1 || parsed === 2 || parsed === 3)) {
            signalType = parsed;
          }
        }

        console.log(`[DECRYPT_START] Attempting decryption for msg=${m.server_message_id || m.id} sender=${m.sender_id} type=${signalType}`);

        try {
          const plaintext = await this.decryptMessage(m.sender_id, m.encrypted_content, signalType);
          if (plaintext && plaintext !== '🔒 [Mensagem Encriptada]') {
            console.log(`[DECRYPT_SUCCESS] Successfully decrypted msg=${m.server_message_id || m.id}`);
            await MessageRepository.saveDecrypted(m.server_message_id ?? null, m.id ?? null, plaintext);
          } else {
            console.log(`[DECRYPT_FAILED] Plaintext placeholder returned for msg=${m.server_message_id || m.id}`);
            await MessageRepository.saveDecrypted(m.server_message_id ?? null, m.id ?? null, '🔒 [Mensagem Encriptada]');
          }
        } catch (e) {
          console.error(`[DECRYPT_FAILED] Error decrypting msg=${m.server_message_id || m.id}:`, e);
          await MessageRepository.saveDecrypted(m.server_message_id ?? null, m.id ?? null, '🔒 [Mensagem Encriptada]');
        }
      }
      
      console.log(`[DECRYPT_START] Recovery completed for ${undecrypted.length} messages`);
    } catch (err) {
      console.error('[DECRYPT] Failed recovering undecrypted messages:', err);
    }
  }
}

export const signalService = new SignalService();
