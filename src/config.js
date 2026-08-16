import fs from 'fs';
import path from 'path';

// All persistent data (WhatsApp session, message DB) lives under this folder.
// On Railway, mount the VOLUME at this exact subfolder (e.g. /app/data) -
// NOT at /app itself, since mounting a volume at /app wipes your whole
// codebase (package.json included) on every deploy.
export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

// Ensure it exists (works both locally and on first deploy before volume has content)
fs.mkdirSync(DATA_DIR, { recursive: true });
