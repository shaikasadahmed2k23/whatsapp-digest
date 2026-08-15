import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'digest.json');

const adapter = new JSONFile(dbPath);
const defaultData = { messages: [] };
const db = new Low(adapter, defaultData);

await db.read();
db.data ||= defaultData;
await db.write();

// --- Message shape ---
// {
//   id, chat_id, chat_name, sender_name, sender_id, is_group,
//   text, timestamp, is_read, is_spam, priority, summary, included_in_digest
// }

export function insertMsg(msg) {
  const exists = db.data.messages.some((m) => m.id === msg.id);
  if (exists) return; // avoid duplicates, same as INSERT OR IGNORE

  db.data.messages.push({
    id: msg.id,
    chat_id: msg.chat_id,
    chat_name: msg.chat_name,
    sender_name: msg.sender_name,
    sender_id: msg.sender_id,
    is_group: msg.is_group,
    text: msg.text,
    timestamp: msg.timestamp,
    is_read: msg.is_read ?? 0,
    is_spam: null,
    priority: null,
    summary: null,
    included_in_digest: 0,
  });

  // fire-and-forget write; callers don't need to await every insert
  db.write();
}

export function markRead(chatId) {
  let changed = false;
  for (const m of db.data.messages) {
    if (m.chat_id === chatId && m.is_read === 0) {
      m.is_read = 1;
      changed = true;
    }
  }
  if (changed) db.write();
}

export function getMessagesSince(unixSeconds) {
  return db.data.messages.filter(
    (m) => m.timestamp >= unixSeconds && m.included_in_digest === 0
  );
}

export function markIncludedInDigest(ids) {
  const idSet = new Set(ids);
  for (const m of db.data.messages) {
    if (idSet.has(m.id)) m.included_in_digest = 1;
  }
  db.write();
}

export default db;
