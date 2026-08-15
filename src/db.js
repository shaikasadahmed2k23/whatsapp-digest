import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'digest.db'));

db.pragma('journal_mode = WAL');

// Core messages table
db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,           -- WhatsApp message id (unique)
    chat_id TEXT NOT NULL,         -- jid of chat/group
    chat_name TEXT,                -- display name of chat/group
    sender_name TEXT,              -- pushName of sender
    sender_id TEXT,                -- jid of sender
    is_group INTEGER DEFAULT 0,
    text TEXT,
    timestamp INTEGER NOT NULL,    -- unix seconds
    is_read INTEGER DEFAULT 0,     -- 0 = unread, 1 = read
    is_spam INTEGER DEFAULT NULL,  -- set after Groq classification
    priority TEXT DEFAULT NULL,    -- 'high' | 'medium' | 'low'
    summary TEXT DEFAULT NULL,     -- short Groq summary (for long msgs)
    included_in_digest INTEGER DEFAULT 0  -- avoid re-sending same msg twice
  )
`);

db.exec(`CREATE INDEX IF NOT EXISTS idx_timestamp ON messages(timestamp)`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_digest ON messages(included_in_digest)`);

export default db;
