// Run this manually anytime to trigger a digest cycle immediately,
// without restarting the WhatsApp bot. Useful for testing.
//
// Usage: node src/triggerDigest.js

import 'dotenv/config';
import { runDigestCycle } from './digestRunner.js';

console.log('🧪 Manually triggering digest cycle...');
await runDigestCycle();
console.log('Done.');
