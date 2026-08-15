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

- is_spam = true for: promotional broadcasts, forwarded chain messages, marketing links, "win prizes" spam, unsolicited group blasts with no personal relevance, generic forwarded jokes/good-morning images/chain forwards with no personal context.

- priority = "high": ONLY for messages that need her actual attention or a timely reply:
  - A DM asking a real question, making a request, or needing a decision from her ("can you send me the file", "are you coming tonight?", "call me when free")
  - Family messages with any substance (not just a greeting)
  - Anything urgent, time-sensitive, or emotionally significant
  - Direct @mentions of her in a group needing a response

- priority = "medium":
  - Casual DM greetings with no real ask ("hii", "hey", "how are you", "wyd", "k") — she should know someone said hi, but it's not urgent
  - Group messages with actionable info relevant to her volunteering/hackathon work (deadlines, event details, admin announcements, meeting times)

- priority = "low": general group chatter, casual banter, non-actionable updates, reactions/emojis only, group messages not relevant to her work.

- Do NOT default to "high" just because something is a DM. Judge by the actual content and whether it needs a response or action from her. A DM saying just "hii" is medium, not high — a DM saying "can we talk, need your help with something urgent" is high.

- If is_spam is true, priority should still be set (usually "low") but it will be excluded from the digest by the caller.

Examples:
- "hii" (DM, no follow-up) → priority: medium
- "how r u doing" (DM, casual) → priority: medium
- "can you send me the resume template by tonight?" (DM, real ask) → priority: high
- "Beta khana khaya?" (DM, family) → priority: high
- "Meeting at 5pm today, mandatory for all volunteers" (group, actionable) → priority: medium
- "😂😂😂" (group, reaction only) → priority: low
- "WIN IPHONE CLICK NOW" (group, spam) → is_spam: true, priority: low

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
