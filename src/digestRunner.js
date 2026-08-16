import {
  getMessagesSince,
  markIncludedInDigest,
  applyClassification,
} from './db.js';
import { classifyMessages } from './groq.js';
import { buildDigest, digestToHtml, digestToText } from './digest.js';
import { buildChatSummaryDigest, chatSummaryToHtml, chatSummaryToText } from './chatSummary.js';
import { sendDigestEmail } from './mailer.js';

const SIX_HOURS_SECONDS = 6 * 60 * 60;

export async function runDigestCycle() {
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

  // second email: compact per-chat overview (chat name + short summary),
  // so it can be scanned fast without reading every message
  const chatSummaryDigest = await buildChatSummaryDigest(classifiedMessages, windowLabel);
  await sendDigestEmail({
    subject: `🗂️ Chat Overview — ${windowLabel}`,
    html: chatSummaryToHtml(chatSummaryDigest),
    text: chatSummaryToText(chatSummaryDigest),
  });

  markIncludedInDigest(messages.map((m) => m.id));
  console.log('✅ Digest cycle complete (2 emails sent).');
}
