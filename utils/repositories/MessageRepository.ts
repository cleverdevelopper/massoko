/**
 * MessageRepository.ts
 * Single source of truth for reading/writing local messages, conversations,
 * and receipts into SQLite.  All callers go through this class.
 */
import { getDB } from '../database';

export interface LocalMessage {
  id?: number;
  server_message_id?: string | null;
  conversation_id: string;
  sender_id: string;
  encrypted_content: string;
  decrypted_content?: string | null;
  is_decrypted?: number;
  signal_message_type?: number | null;
  message_type?: string;
  sent_at?: string | null;
  created_at?: string;
}

export class MessageRepository {
  // -------------------------------------------------------------------
  // Conversations
  // -------------------------------------------------------------------
  static async upsertConversation(
    serverConversationId: string,
    title?: string,
    avatar?: string
  ): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT INTO local_conversations (server_conversation_id, title, avatar, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(server_conversation_id) DO UPDATE SET
         title      = excluded.title,
         avatar     = excluded.avatar,
         updated_at = CURRENT_TIMESTAMP`,
      [serverConversationId, title ?? null, avatar ?? null]
    );
  }

  // -------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------

  /**
   * Insert or ignore a raw (encrypted) message received from the server.
   * Returns the local rowid.
   */
  static async insertRaw(msg: LocalMessage): Promise<number> {
    console.log(`[SQLITE_INSERT] Inserting raw message for conversation ${msg.conversation_id}, sender ${msg.sender_id}`);
    const db = getDB();
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO local_messages
         (server_message_id, conversation_id, sender_id,
          encrypted_content, decrypted_content, is_decrypted, signal_message_type,
          message_type, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        msg.server_message_id ?? null,
        msg.conversation_id,
        msg.sender_id,
        msg.encrypted_content,
        msg.decrypted_content ?? null,
        msg.is_decrypted ?? (msg.decrypted_content ? 1 : 0),
        msg.signal_message_type ?? null,
        msg.message_type ?? 'text',
        msg.sent_at ?? null,
      ]
    );
    console.log(`[SQLITE_INSERT] Inserted message with local row ID ${result.lastInsertRowId}`);
    return result.lastInsertRowId;
  }

  /**
   * After a successful decryption, store the plaintext so it is never
   * decrypted again.  Works by server_message_id OR local rowid.
   */
  static async saveDecrypted(
    serverMessageId: string | null,
    localId: number | null,
    decryptedContent: string
  ): Promise<void> {
    console.log(`[SQLITE_UPDATE] Saving decrypted content for msg ${serverMessageId || localId}`);
    const db = getDB();
    if (serverMessageId) {
      const result = await db.runAsync(
        `UPDATE local_messages
            SET decrypted_content = ?, is_decrypted = 1
          WHERE server_message_id = ?`,
        [decryptedContent, serverMessageId]
      );
      console.log(`[SQLITE_UPDATE] Updated ${result.changes} rows for server message ${serverMessageId}`);
    } else if (localId) {
      const result = await db.runAsync(
        `UPDATE local_messages
            SET decrypted_content = ?, is_decrypted = 1
          WHERE id = ?`,
        [decryptedContent, localId]
      );
      console.log(`[SQLITE_UPDATE] Updated ${result.changes} rows for local message ${localId}`);
    }
  }

  /**
   * Load all messages for a conversation ordered oldest-first.
   * Returns them with decrypted_content when available.
   */
  static async getMessages(conversationId: string): Promise<LocalMessage[]> {
    const db = getDB();
    return db.getAllAsync<LocalMessage>(
      `SELECT * FROM local_messages
        WHERE conversation_id = ?
        ORDER BY sent_at ASC, id ASC`,
      [conversationId]
    );
  }

  /**
   * Look up a single message by its server id.
   * Used to check whether we already have the decrypted version.
   */
  static async getByServerId(serverMessageId: string): Promise<LocalMessage | null> {
    const db = getDB();
    return db.getFirstAsync<LocalMessage>(
      `SELECT * FROM local_messages WHERE server_message_id = ?`,
      [serverMessageId]
    );
  }

  static async updateServerMessageId(
    tempId: string,
    serverMsgId: string,
    encryptedContent?: string | null,
    sentAt?: string | null
  ): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `UPDATE local_messages
          SET server_message_id = ?,
              encrypted_content = COALESCE(?, encrypted_content),
              sent_at = COALESCE(?, sent_at),
              is_decrypted = 1
        WHERE server_message_id = ?`,
      [serverMsgId, encryptedContent ?? null, sentAt ?? null, tempId]
    );
  }

  /**
   * Find a temporary outgoing message by sender_id and decrypted content.
   */
  static async findTempMessage(
    senderId: string,
    decryptedContent: string
  ): Promise<LocalMessage | null> {
    const db = getDB();
    return db.getFirstAsync<LocalMessage>(
      `SELECT * FROM local_messages
        WHERE sender_id = ?
          AND server_message_id LIKE 'temp-%'
          AND decrypted_content = ?
        ORDER BY id ASC LIMIT 1`,
      [senderId, decryptedContent]
    );
  }

  static async getUndecryptedMessages(conversationId?: string): Promise<LocalMessage[]> {
    const db = getDB();
    if (conversationId) {
      return db.getAllAsync<LocalMessage>(
        `SELECT * FROM local_messages WHERE is_decrypted = 0 AND conversation_id = ?`,
        [conversationId]
      );
    } else {
      return db.getAllAsync<LocalMessage>(
        `SELECT * FROM local_messages WHERE is_decrypted = 0`
      );
    }
  }

  // -------------------------------------------------------------------
  // Outgoing queue
  // -------------------------------------------------------------------

  static async enqueue(
    localId: string,
    conversationId: string,
    encryptedContent: string,
    signalMessageType: number
  ): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT OR IGNORE INTO outgoing_message_queue
         (local_id, conversation_id, encrypted_content, signal_message_type, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [localId, conversationId, encryptedContent, signalMessageType]
    );
  }

  static async getPendingQueue(): Promise<
    { local_id: string; conversation_id: string; encrypted_content: string; signal_message_type: number }[]
  > {
    const db = getDB();
    return db.getAllAsync(
      `SELECT local_id, conversation_id, encrypted_content, signal_message_type
         FROM outgoing_message_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC`
    );
  }

  static async updateQueueStatus(localId: string, status: string): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `UPDATE outgoing_message_queue SET status = ? WHERE local_id = ?`,
      [status, localId]
    );
  }

  static async removeFromQueue(localId: string): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `DELETE FROM outgoing_message_queue WHERE local_id = ?`,
      [localId]
    );
  }

  // -------------------------------------------------------------------
  // Receipts
  // -------------------------------------------------------------------

  static async markDelivered(messageId: string): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT INTO message_receipts (message_id, delivered_at)
       VALUES (?, CURRENT_TIMESTAMP)
       ON CONFLICT(message_id) DO UPDATE SET delivered_at = CURRENT_TIMESTAMP`,
      [messageId]
    );
  }

  static async markRead(messageId: string): Promise<void> {
    const db = getDB();
    await db.runAsync(
      `INSERT INTO message_receipts (message_id, delivered_at, read_at)
       VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(message_id) DO UPDATE SET
         delivered_at = COALESCE(delivered_at, CURRENT_TIMESTAMP),
         read_at      = CURRENT_TIMESTAMP`,
      [messageId]
    );
  }
}
