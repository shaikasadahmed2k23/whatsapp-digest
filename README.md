# WhatsApp Digest Bot

An automation that reads your WhatsApp messages, classifies them by priority and spam using an LLM, and emails you a digest 4 times a day — so you don't have to scroll through dozens of group chats to catch what actually matters.

Built for a friend who's a GDG volunteer, active in hackathon and Unstop communities, and part of many WhatsApp groups — she kept missing important messages buried in group noise.

## How it works

1. **WhatsApp connection** — logs into WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys), an unofficial WhatsApp Web client library. First run shows a QR code (both as ASCII art and as a scannable image link, since ASCII QR codes often render broken in hosting-platform log viewers) — scan it once with the WhatsApp linked-devices flow, and the session persists after that.
2. **Message capture** — every incoming message is stored locally in a JSON database (lowdb), tagged with chat name, sender, timestamp, message type, and read/unread status. Media messages (photos, videos, voice notes, stickers, documents, location) get clear type labels instead of a generic "unsupported message" placeholder.
3. **Scheduled digest cycle** — a cron job (`node-cron`, pinned to `Asia/Kolkata` timezone) runs every 6 hours: 12am, 6am, 12pm, 6pm IST.
4. **Classification** — unread messages since the last cycle are batched and sent to Groq (`llama-3.3-70b-versatile`, free tier) for classification into:
   - **Priority**: high / medium / low (tuned so plain greetings like "hii", "how r u" land as medium, not high — only messages that actually need a response or action are high priority)
   - **Spam**: flagged and excluded from the digest
5. **Two digest emails are sent per cycle**, both via [Resend](https://resend.com)'s HTTPS API:
   - **Detailed digest** — individual messages grouped by priority, so nothing important gets missed
   - **Chat Overview** — a compact second email: one line per chat (chat name + a short AI-generated summary of what's happening there), for a 10-second scan. If something looks worth a closer look, open WhatsApp directly.

## Tech stack

| Piece | Choice | Why |
|---|---|---|
| Runtime | Node.js (ESM) | — |
| WhatsApp client | Baileys | Unofficial but reliable WhatsApp Web protocol library, QR login |
| Storage | lowdb (JSON file) | Simple, avoids native build issues (e.g. better-sqlite3 failing on Windows dev machines) |
| Classification & summarization | Groq API (`llama-3.3-70b-versatile`) | Fast, generous free tier |
| Email delivery | Resend (HTTPS API) | Many hosts (including Railway) block outbound SMTP ports 465/587 at the network level — Resend sidesteps this entirely since it's a plain HTTPS call, not SMTP |
| Scheduling | node-cron | Timezone-pinned to `Asia/Kolkata` |
| Hosting | Railway | Persistent volume mounted for WhatsApp auth session + message DB |

## Project structure

```
src/
  index.js          entrypoint — starts WhatsApp connection + cron schedule
  whatsapp.js        Baileys connection, QR handling, incoming message capture
  db.js               lowdb setup and message storage helpers
  groq.js             Groq API calls: message classification + chat-level summarization
  digest.js           builds the detailed (per-message) digest HTML/text
  chatSummary.js       builds the compact per-chat overview HTML/text
  digestRunner.js       orchestrates one digest cycle: classify → build both digests → send both emails
  mailer.js             sends email via Resend's HTTPS API
  triggerDigest.js       manually run a digest cycle on demand, without waiting for the schedule
  config.js               env-driven config (data directory, etc.)
```

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `GROQ_API_KEY` — from [console.groq.com](https://console.groq.com)
   - `RESEND_API_KEY` — from [resend.com](https://resend.com)
   - `EMAIL_FROM` — e.g. `WhatsApp Digest <onboarding@resend.dev>` (verify your own domain on Resend for production use)
   - `DIGEST_RECIPIENT` — where digest emails get sent
3. `npm start` — scan the QR code shown in the console output to link WhatsApp
4. To test a digest cycle immediately without waiting for the schedule:
   ```
   node src/triggerDigest.js
   ```

## Deployment notes (Railway)

- Mount a persistent **Volume** at a subdirectory like `/app/data` — **not** `/app` itself, since mounting a volume at the app root wipes the deployed codebase on every redeploy.
- Point `DATA_DIR` (via `src/config.js`) at that mounted path so `auth_session` (WhatsApp login) and `digest.json` (message DB) survive redeploys.
- Railway blocks outbound SMTP ports (465/587) on at least some plans — confirmed by direct TCP connection tests timing out from inside the container. This is why the mailer uses Resend's HTTPS API instead of Nodemailer/SMTP.

## Known limitations / next steps

- **Groq free-tier daily token limit**: a single digest cycle with a high message volume (500+ messages) can consume most or all of the 100,000 tokens/day free-tier allowance in one run, causing later classification batches to fail and fall back to a generic "medium priority" default. Planned fixes: switch to a lighter model (`llama-3.1-8b-instant`) for classification/summarization, truncate message text sent to Groq, and/or generate the chat-overview summary from already-classified data instead of a second LLM pass.
- Currently tested against a personal WhatsApp number, not yet connected to the intended recipient's real number — pending a privacy conversation (messages are sent to Groq's API for classification, and the WhatsApp connection method is unofficial).
