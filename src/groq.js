import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// Process in chunks so we never blow past context/token limits,
// and one bad batch doesn't kill the whole run.
const BATCH_SIZE = 25;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const SYSTEM_PROMPT = `You are a message triage assistant for a busy student who is a GDG volunteer and active on Unstop, receiving many WhatsApp messages daily.

For EACH message given, classify it. Return a JSON object with this exact shape:
{
  "results": [
    {
      "id": "<the message id, copied exactly as given>",
      "is_spam": true or false,
      "priority": "high" | "medium" | "low",
      "summary": "<one short sentence summary, ONLY if the message is long (over ~25 words); otherwise null>"
    }
  ]
}

The "results" array must have one object per message given, in the SAME ORDER.

Classification rules:
- is_spam = true for: promotional broadcasts, forwarded chain messages, marketing links, "win prizes" spam, unsolicited group blasts with no personal relevance, generic forwarded jokes/good-morning images with no context.
- priority = "high": direct messages (DMs) from a person, especially ones asking a question, requesting a reply, or personal/family messages.
- priority = "medium": group messages with actionable info (deadlines, event details, admin announcements, meeting times) relevant to her volunteering/hackathon work.
- priority = "low": general group chatter, casual banter, non-actionable updates, reactions/emojis only.
- If is_spam is true, priority should still be set (usually "low") but it will be excluded from the digest by the caller.

Return ONLY the raw JSON object. No markdown formatting, no code fences, no explanation text before or after.`;

export async function classifyMessages(messages) {
  if (messages.length === 0) return [];

  const batches = chunk(messages, BATCH_SIZE);
  const allResults = [];

  for (const batch of batches) {
    const userContent = batch
      .map(
        (m) =>
          `id: ${m.id}\nfrom: ${m.sender_name} (${m.is_group ? 'group: ' + m.chat_name : 'DM'})\ntext: ${m.text}`
      )
      .join('\n---\n');

    try {
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = parseGroqJson(raw);
      allResults.push(...parsed);
    } catch (err) {
      console.error('⚠️ Groq classification failed for a batch:', err.message);
      // fail-safe: mark this batch as medium priority, not spam, so nothing important gets silently dropped
      for (const m of batch) {
        allResults.push({
          id: m.id,
          is_spam: false,
          priority: 'medium',
          summary: null,
        });
      }
    }
  }

  return allResults;
}

// Groq with response_format json_object sometimes wraps the array in a key,
// or occasionally still adds stray text - handle both cases defensively.
function parseGroqJson(raw) {
  let cleaned = raw.trim();
  // strip code fences if present, just in case
  cleaned = cleaned.replace(/^```json\s*/i, '').replace(/```\s*$/, '');

  const obj = JSON.parse(cleaned);
  if (Array.isArray(obj)) return obj;

  // if it came back as { "results": [...] } or similar, grab the first array value
  const arrKey = Object.keys(obj).find((k) => Array.isArray(obj[k]));
  if (arrKey) return obj[arrKey];

  throw new Error('Could not find array in Groq response');
}
