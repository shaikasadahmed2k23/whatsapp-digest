// Builds a compact "chat name — summary" digest, one line per chat,
// instead of listing every individual message. Excludes spam, same as
// the main digest.

import { summarizeChats } from './groq.js';

function chatKey(m) {
  return m.is_group ? m.chat_name : m.sender_name;
}

export async function buildChatSummaryDigest(classifiedMessages, windowLabel) {
  const relevant = classifiedMessages.filter((m) => !m.is_spam);

  // group messages by chat
  const byChat = new Map();
  for (const m of relevant) {
    const key = chatKey(m);
    if (!byChat.has(key)) byChat.set(key, []);
    byChat.get(key).push(m);
  }

  const chatGroups = Array.from(byChat.entries()).map(([chat_name, messages]) => ({
    chat_name,
    messages,
    hasHighPriority: messages.some((m) => m.priority === 'high'),
    unreadCount: messages.filter((m) => !m.is_read).length,
  }));

  const summaries = await summarizeChats(
    chatGroups.map((g) => ({ chat_name: g.chat_name, messages: g.messages }))
  );

  // merge summary text back onto each chat group, keep high-priority chats on top
  const merged = chatGroups
    .map((g) => {
      const s = summaries.find((x) => x.chat_name === g.chat_name);
      return { ...g, summary: s?.summary || `${g.messages.length} new message(s).` };
    })
    .sort((a, b) => Number(b.hasHighPriority) - Number(a.hasHighPriority));

  return {
    windowLabel,
    chats: merged,
    totalChats: merged.length,
  };
}

export function chatSummaryToHtml(digest) {
  if (digest.chats.length === 0) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px;">
        <h2>🗂️ Chat Overview — ${escapeHtml(digest.windowLabel)}</h2>
        <p>No new activity in this window.</p>
      </div>
    `;
  }

  const rows = digest.chats
    .map((c) => {
      const flag = c.hasHighPriority ? '🔴 ' : '';
      const unread = c.unreadCount > 0 ? ` <span style="color:#888;font-size:0.85em;">(${c.unreadCount} unread)</span>` : '';
      return `<li style="margin-bottom:10px;"><strong>${flag}${escapeHtml(c.chat_name)}</strong>${unread}<br/><span style="color:#333;">${escapeHtml(c.summary)}</span></li>`;
    })
    .join('\n');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>🗂️ Chat Overview — ${escapeHtml(digest.windowLabel)}</h2>
      <p style="color:#888; font-size:0.85em;">${digest.totalChats} chat(s) had activity. Open WhatsApp if anything needs a closer look.</p>
      <ul style="list-style:none; padding-left:0;">${rows}</ul>
    </div>
  `;
}

export function chatSummaryToText(digest) {
  const lines = [`🗂️ Chat Overview — ${digest.windowLabel}`, ''];

  if (digest.chats.length === 0) {
    lines.push('No new activity in this window.');
    return lines.join('\n');
  }

  for (const c of digest.chats) {
    const flag = c.hasHighPriority ? '🔴 ' : '';
    const unread = c.unreadCount > 0 ? ` (${c.unreadCount} unread)` : '';
    lines.push(`${flag}${c.chat_name}${unread}`);
    lines.push(`  ${c.summary}`);
    lines.push('');
  }

  return lines.join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
