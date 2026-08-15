import 'dotenv/config';
import cron from 'node-cron';
import { startWhatsApp } from './whatsapp.js';
import {
  getMessagesSince,
  markIncludedInDigest,
  applyClassification,
} from './db.js';
import { classifyMessages } from './groq.js';
import { buildDigest, digestToHtml, digestToText } from './digest.js';
import { sendDigestEmail } from './mailer.js';

const SIX_HOURS_SECONDS = 6 * 60 * 60;

async function runDigestCycle() {
  console.log('⏰ Running digest cycle...');

  const sinceTimestamp = Math.floor(Date.now() / 1000) - SIX_HOURS_SECONDS;
  const messages = getMessagesSince(sinceTimestamp);

  if (messages.length === 0) {
    console.log('No new messages this window, skipping email.');
    return;
  }

  console.log(`Classifying ${messages.length} messages via Groq...`);
  const results = await classifyMessages(messages);
  applyClassification(results);

  // attach classification results onto the message objects for digest building
  const classifiedMessages = messages.map((m) => {
    const r = results.find((x) => x.id === m.id);
    return { ...m, ...r };
  });

  const windowLabel = new Date().toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const digest = buildDigest(classifiedMessages, windowLabel);

  await sendDigestEmail({
    subject: `📬 WhatsApp Digest — ${windowLabel}`,
    html: digestToHtml(digest),
    text: digestToText(digest),
  });

  markIncludedInDigest(messages.map((m) => m.id));
  console.log('✅ Digest cycle complete.');
}

console.log('🚀 Starting WhatsApp Digest bot...');
startWhatsApp();

// Runs at 12am, 6am, 12pm, 6pm (4x/day, 6hr apart) — adjust times to fit her routine
cron.schedule('0 0,6,12,18 * * *', runDigestCycle);

console.log('🕐 Digest cycle scheduled for 12am, 6am, 12pm, 6pm daily.');

// Uncomment to manually trigger a digest immediately for testing:
// runDigestCycle();
