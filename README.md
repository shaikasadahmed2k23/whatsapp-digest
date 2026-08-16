# WhatsApp Digest Bot

An automation that reads your WhatsApp messages, classifies them by priority and spam using an LLM, and emails you a digest 4x a day — so you never have to scroll through dozens of group chats to catch what actually matters.

> **Note:** This repo holds an early version of the project. Active development and the current live deployment are at [a06028225-hue/whatsapp-digest](https://github.com/a06028225-hue/whatsapp-digest).

## What it does

- Connects to WhatsApp via [Baileys](https://github.com/WhiskeySockets/Baileys) (QR login, no official WhatsApp Business API needed)
- Stores incoming messages locally (lowdb)
- Every 6 hours, classifies unread messages using Groq (`llama-3.3-70b-versatile`) into priority levels (high/medium/low) and flags spam
- Sends a digest email via [Resend](https://resend.com) — split into two emails:
  1. A detailed digest with individual messages, grouped by priority
  2. A compact "Chat Overview" — one line per chat with a short AI-generated summary, so you can scan it in seconds and only open WhatsApp if something needs a closer look

## Tech stack

- **Node.js (ESM)**
- **Baileys** — unofficial WhatsApp Web client
- **Groq API** — message classification and chat summarization
- **Resend** — transactional email (HTTPS API, not SMTP — many hosts block outbound SMTP ports)
- **lowdb** — lightweight JSON storage
- **node-cron** — scheduling (runs on `Asia/Kolkata` timezone)

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `GROQ_API_KEY`
   - `RESEND_API_KEY`
   - `EMAIL_FROM`
   - `DIGEST_RECIPIENT`
3. `npm start` — scan the QR code shown in the console/logs to link WhatsApp
4. To test a digest cycle immediately without waiting for the schedule: `node src/triggerDigest.js`

## Notes

- Built for a friend who's active across many WhatsApp groups (hackathons, GDG, Unstop) and kept missing important messages in the noise.
- Deployed on Railway with a persistent volume for the WhatsApp auth session and message DB.
