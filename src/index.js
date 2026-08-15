import 'dotenv/config';
import { startWhatsApp } from './whatsapp.js';

console.log('🚀 Starting WhatsApp Digest bot...');
startWhatsApp();

// Cron scheduler (digest + Groq classification) gets wired in next step.
