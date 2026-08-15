// Builds a structured digest object from classified messages.
// Excludes spam entirely. Groups by priority. Includes read/unread tag.

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_LABEL = { high: '🔴 HIGH PRIORITY', medium: '🟡 MEDIUM', low: '🟢 LOW' };

export function buildDigest(messages, windowLabel) {
  const spamCount = messages.filter((m) => m.is_spam).length;
  const relevant = messages.filter((m) => !m.is_spam);

  // group by priority
  const groups = { high: [], medium: [], low: [] };
  for (const m of relevant) {
    const p = m.priority || 'low';
    groups[p].push(m);
  }

  // sort each group by timestamp (oldest first, so it reads chronologically)
  for (const p of Object.keys(groups)) {
    groups[p].sort((a, b) => a.timestamp - b.timestamp);
  }

  return {
    windowLabel,
    totalMessages: messages.length,
    spamCount,
    relevantCount: relevant.length,
    groups, // { high: [...], medium: [...], low: [...] }
  };
}

function displayName(m) {
  return m.is_group ? `${m.sender_name} (${m.chat_name})` : m.sender_name;
}

function readTag(m) {
  return m.is_read ? '🟢 Read' : '🔴 Unread';
}

export function digestToHtml(digest) {
  const sections = ['high', 'medium', 'low']
    .map((p) => {
      const items = digest.groups[p];
      if (items.length === 0) return '';

      const rows = items
        .map((m) => {
          const text = m.summary || m.text;
          return `<li><strong>${escapeHtml(displayName(m))}</strong>: ${escapeHtml(text)} <span style="color:#888;font-size:0.85em;">— ${readTag(m)}</span></li>`;
        })
        .join('\n');

      return `<h3>${PRIORITY_LABEL[p]} (${items.length})</h3><ul>${rows}</ul>`;
    })
    .join('\n');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>📬 WhatsApp Digest — ${escapeHtml(digest.windowLabel)}</h2>
      ${sections || '<p>No new messages in this window.</p>'}
      <p style="color:#888; font-size:0.85em; margin-top: 20px;">
        🔕 ${digest.spamCount} spam/promotional message(s) filtered out.
      </p>
    </div>
  `;
}

export function digestToText(digest) {
  const lines = [`📬 WhatsApp Digest — ${digest.windowLabel}`, ''];

  for (const p of ['high', 'medium', 'low']) {
    const items = digest.groups[p];
    if (items.length === 0) continue;
    lines.push(`${PRIORITY_LABEL[p]} (${items.length})`);
    for (const m of items) {
      const text = m.summary || m.text;
      lines.push(`• ${displayName(m)}: ${text} — ${readTag(m)}`);
    }
    lines.push('');
  }

  if (digest.relevantCount === 0) lines.push('No new messages in this window.');
  lines.push(`🔕 ${digest.spamCount} spam/promotional message(s) filtered out.`);

  return lines.join('\n');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
