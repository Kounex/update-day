import { makeDirectory } from 'make-dir';
import Bot from './bot';
import Config from './config';
import container from './inversify.config';
import SchedulerManager from './managers/scheduler';
import { TYPES } from './types';

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
