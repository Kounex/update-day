import Bot from './bot.js';
import container from './inversify.config.js';
import SchedulerManager from './managers/scheduler.js';
import { TYPES } from './types.js';

const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  // Create data directories if necessary
  // const config = container.get<Config>(TYPES.Config);
  // await makeDirectory(config.DATA_DIR);

  // Start the Scheduler
  const schedulerManager = container.get<SchedulerManager>(
    TYPES.Managers.Scheduler
  );
  schedulerManager.init();

  await bot.register();
};

export { startBot };
