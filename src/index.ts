import { Client } from 'discord.js';
import Bot from './bot.js';
import container from './inversify.config.js';
import SchedulerManager from './managers/scheduler.js';
import BrowserService from './services/browser.js';
import { TYPES } from './types.js';
import { prisma } from './utils/db.js';
import logger from './utils/logger.js';

const bot = container.get<Bot>(TYPES.Bot);

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.info(`${signal} received, shutting down`);
  container.get<SchedulerManager>(TYPES.Managers.Scheduler).stop();
  // Anything still running is lost either way - don't let it hold up the
  // container stop (Docker kills after 10 s).
  const forceExit = setTimeout(() => process.exit(0), 8_000);
  forceExit.unref();
  await Promise.allSettled([
    container.get<BrowserService>(TYPES.Services.Browser).close(),
    container.get<Client>(TYPES.Client).destroy(),
    prisma.$disconnect(),
  ]);
  process.exit(0);
};

const startBot = async () => {
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  // Log instead of dying on a stray rejection somewhere deep in a library;
  // real wedges are caught by the scheduler's watchdog.
  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason);
  });

  container.get<SchedulerManager>(TYPES.Managers.Scheduler).init();

  await bot.register();
};

export { startBot };
