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
    const db = getDB();
    const result = await db.runAsync(
      `INSERT OR IGNORE INTO local_messages
         (server_message_id, conversation_id, sender_id,
          encrypted_content, decrypted_content, signal_message_type,
          message_type, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        msg.server_message_id ?? null,
        msg.conversation_id,
        msg.sender_id,
        msg.encrypted_content,
        msg.decrypted_content ?? null,
        msg.signal_message_type ?? null,
        msg.message_type ?? 'text',
        msg.sent_at ?? null,
      ]
    );
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
    const db = getDB();
    if (serverMessageId) {
      await db.runAsync(
        `UPDATE local_messages
            SET decrypted_content = ?
          WHERE server_message_id = ?`,
        [decryptedContent, serverMessageId]
      );
    } else if (localId) {
      await db.runAsync(
        `UPDATE local_messages
            SET decrypted_content = ?
          WHERE id = ?`,
        [decryptedContent, localId]
      );
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
