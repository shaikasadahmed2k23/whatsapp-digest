import 'dotenv/config';
import http from 'http';
import cron from 'node-cron';
import { startWhatsApp } from './whatsapp.js';
import { runDigestCycle } from './digestRunner.js';

// Render (and similar platforms) expect a web service to listen on a port.
// This tiny server exists only so the platform sees "app is alive" -
// it has no real functionality, just keeps the process classified correctly.
const PORT = process.env.PORT || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('WhatsApp Digest bot is running.\n');
  })
  .listen(PORT, () => {
    console.log(`🌐 Health check server listening on port ${PORT}`);
  });

console.log('🚀 Starting WhatsApp Digest bot...');
startWhatsApp();

// Runs at 12am, 6am, 12pm, 6pm IST (4x/day, 6hr apart) — adjust times to fit her routine
cron.schedule('0 0,6,12,18 * * *', runDigestCycle, {
  timezone: 'Asia/Kolkata',
});

console.log('🕐 Digest cycle scheduled for 12am, 6am, 12pm, 6pm IST daily.');
