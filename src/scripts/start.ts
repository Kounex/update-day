// This script is mainly used during development.
// Starts Muse without applying database migrations.
import { DATA_DIR } from '../config.js';
import { startBot } from '../index.js';
import createDatabaseUrl from '../utils/create-database-url.js';
import logBanner from '../utils/log-banner.js';

process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? createDatabaseUrl(DATA_DIR);

(async () => {
  logBanner();
  await startBot();
})();
