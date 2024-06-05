import { makeDirectory } from 'make-dir';
import Bot from './bot';
import Config from './config';
import container from './inversify.config';
import { TYPES } from './types';

const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  // Create data directories if necessary
  const config = container.get<Config>(TYPES.Config);
  await makeDirectory(config.DATA_DIR);

  await bot.register();
};

export { startBot };
