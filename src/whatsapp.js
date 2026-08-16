import {
  default as makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import { insertMsg, markRead } from './db.js';
import path from 'path';
import { DATA_DIR } from './config.js';

// where the login session is saved -> lives inside DATA_DIR so it
// persists correctly on the mounted volume (see config.js for why)
const AUTH_FOLDER = path.join(DATA_DIR, 'auth_session');

// Extracts readable text from any WhatsApp message type.
// Captions are included where present; media without caption gets a clear label.
function extractMessageText(message) {
  if (!message) return '[unknown message]';

  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;

  if (message.imageMessage) {
    return message.imageMessage.caption
      ? `📷 Photo: ${message.imageMessage.caption}`
      : '📷 Sent a photo';
  }
  if (message.videoMessage) {
    return message.videoMessage.caption
      ? `🎥 Video: ${message.videoMessage.caption}`
      : '🎥 Sent a video';
  }
  if (message.audioMessage) {
    return message.audioMessage.ptt ? '🎤 Sent a voice note' : '🎵 Sent an audio file';
  }
  if (message.stickerMessage) return '🩹 Sent a sticker';
  if (message.documentMessage) {
    const name = message.documentMessage.fileName || 'a file';
    return `📄 Sent a document: ${name}`;
  }
  if (message.locationMessage) return '📍 Shared a location';
  if (message.contactMessage) return `👤 Shared a contact: ${message.contactMessage.displayName || ''}`;
  if (message.pollCreationMessage || message.pollCreationMessageV3) {
    const poll = message.pollCreationMessage || message.pollCreationMessageV3;
    return `📊 Created a poll: ${poll.name || ''}`;
  }
  if (message.reactionMessage) return `Reacted ${message.reactionMessage.text || ''}`;
  if (message.viewOnceMessage || message.viewOnceMessageV2) return '👁️ Sent a view-once message';

  return '[unsupported message type]';
}

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
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
      console.log('\n📱 Open this link in your browser to see a scannable QR code:');
      console.log(qrImageUrl);
      console.log('\n(Also printing ASCII version below, in case the link works but this is easier for some setups)\n');
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

      // skip WhatsApp Channels/newsletters and Status updates - not real chats
      if (chatId.endsWith('@newsletter') || chatId === 'status@broadcast') {
        continue;
      }

      const isGroup = chatId.endsWith('@g.us');
      const text = extractMessageText(msg.message);

      const chatName = await getChatName(chatId, isGroup);

      console.log(`📩 New message | ${chatName} | ${msg.pushName}: ${text}`);

      insertMsg({
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
        markRead(u.key.remoteJid);
      }
    }
  });

  // Alternative/extra signal: chats.update fires with unreadCount changes too
  sock.ev.on('chats.update', (updates) => {
    for (const u of updates) {
      if (u.unreadCount === 0 && u.id) {
        markRead(u.id);
      }
    }
  });

  return sock;
}
