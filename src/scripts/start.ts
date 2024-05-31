// This script is mainly used during development.
// Starts Muse without applying database migrations.
import { startBot } from '../index.js';
import logBanner from '../utils/log-banner';

(async () => {
  logBanner();
  await startBot();
})();
