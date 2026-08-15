import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import db from './db.js';

// where the login session is saved -> MUST persist this folder on deploy
// (mount it as a volume, otherwise every restart = re-scan QR)
const AUTH_FOLDER = 'auth_session';

const insertMsg = db.prepare(`
  INSERT OR IGNORE INTO messages
  (id, chat_id, chat_name, sender_name, sender_id, is_group, text, timestamp, is_read)
  VALUES (@id, @chat_id, @chat_name, @sender_name, @sender_id, @is_group, @text, @timestamp, @is_read)
`);

const markRead = db.prepare(`
  UPDATE messages SET is_read = 1 WHERE chat_id = ? AND is_read = 0
`);

export async function startWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);

  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }), // set to 'info' if debugging
    printQRInTerminal: false, // we handle QR manually below for clarity
  });

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log('\n📱 Scan this QR with WhatsApp > Linked Devices:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        new Boom(lastDisconnect?.error)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log('Connection closed. Reconnecting:', shouldReconnect);
      if (shouldReconnect) startWhatsApp();
    } else if (connection === 'open') {
      console.log('✅ WhatsApp connected and listening.');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  // simple in-memory cache so we don't hit groupMetadata() on every message
  const groupNameCache = new Map();
  async function getChatName(chatId, isGroup) {
    if (!isGroup) return chatId.split('@')[0]; // DM -> just the number for now
    if (groupNameCache.has(chatId)) return groupNameCache.get(chatId);
    try {
      const meta = await sock.groupMetadata(chatId);
      groupNameCache.set(chatId, meta.subject);
      return meta.subject;
    } catch {
      return chatId;
    }
  }

  // --- Capture every incoming message ---
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return; // only fresh incoming messages

    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue; // skip her own sent msgs

      const chatId = msg.key.remoteJid;
      const isGroup = chatId.endsWith('@g.us');
      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        '[media/unsupported message]';

      const chatName = await getChatName(chatId, isGroup);

      insertMsg.run({
        id: msg.key.id,
        chat_id: chatId,
        chat_name: chatName,
        sender_name: msg.pushName || 'Unknown',
        sender_id: msg.key.participant || chatId,
        is_group: isGroup ? 1 : 0,
        text,
        timestamp: Number(msg.messageTimestamp),
        is_read: 0,
      });
    }
  });

  // --- Read-status sync: when she reads a chat on her phone, this fires ---
  sock.ev.on('message-receipt.update', (updates) => {
    for (const u of updates) {
      if (u.receipt?.readTimestamp) {
        markRead.run(u.key.remoteJid);
      }
    }
  });

  // Alternative/extra signal: chats.update fires with unreadCount changes too
  sock.ev.on('chats.update', (updates) => {
    for (const u of updates) {
      if (u.unreadCount === 0 && u.id) {
        markRead.run(u.id);
      }
    }
  });

  return sock;
}
