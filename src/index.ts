import Bot from './bot';
import container from './inversify.config';
import { TYPES } from './types';

const bot = container.get<Bot>(TYPES.Bot);

const startBot = async () => {
  await bot.register();
};

export { startBot };
