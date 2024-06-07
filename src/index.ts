import { makeDirectory } from 'make-dir';
import Bot from './bot.js';
import Config from './config.js';
import container from './inversify.config.js';
import SchedulerManager from './managers/scheduler.js';
import { TYPES } from './types.js';

const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  // Create data directories if necessary
  const config = container.get<Config>(TYPES.Config);
  await makeDirectory(config.DATA_DIR);

  // Start the Scheduler
  const scheduler = container.get<SchedulerManager>(TYPES.Managers.Scheduler);
  scheduler.init();

  await bot.register();
};

export { startBot };
