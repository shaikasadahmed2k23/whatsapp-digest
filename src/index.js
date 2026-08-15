import 'dotenv/config';
import cron from 'node-cron';
import { startWhatsApp } from './whatsapp.js';
import { runDigestCycle } from './digestRunner.js';

console.log('🚀 Starting WhatsApp Digest bot...');
startWhatsApp();

// Runs at 12am, 6am, 12pm, 6pm (4x/day, 6hr apart) — adjust times to fit her routine
cron.schedule('0 0,6,12,18 * * *', runDigestCycle);

console.log('🕐 Digest cycle scheduled for 12am, 6am, 12pm, 6pm daily.');
