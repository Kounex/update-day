import { Client, GatewayIntentBits } from 'discord.js';
import { Container } from 'inversify';
import 'reflect-metadata';
import Bot from './bot.js';
import Config from './config.js';
import { TYPES } from './types.js';

// Managers
import ObserveManager from './managers/observe.js';
import SchedulerManager from './managers/scheduler.js';

// Services
import BrowserService from './services/browser.js';
import NotifierService from './services/notifier.js';
import ScrapeService from './services/scrape.js';
import SettingsService from './services/settings.js';

// Commands
import Admin from './commands/admin.js';
import Command from './commands/command.js';
import Delete from './commands/delete.js';
import Edit from './commands/edit.js';
import History from './commands/history.js';
import List from './commands/list.js';
import Observe from './commands/observe.js';
import Pause from './commands/pause.js';
import Preview from './commands/preview.js';
import Reactivate from './commands/reactivate.js';
import Scrape from './commands/scrape.js';
import Settings from './commands/settings.js';

const container = new Container();

// Intents
const intents: GatewayIntentBits[] = [];
intents.push(GatewayIntentBits.Guilds); // To listen for guildCreate event

// Bot
container.bind<Bot>(TYPES.Bot).to(Bot).inSingletonScope();
container.bind<Client>(TYPES.Client).toConstantValue(new Client({ intents }));

// Managers
container
  .bind<SchedulerManager>(TYPES.Managers.Scheduler)
  .to(SchedulerManager)
  .inSingletonScope();
container
  .bind<ObserveManager>(TYPES.Managers.Observe)
  .to(ObserveManager)
  .inSingletonScope();

// Services
container.bind(TYPES.Services.Browser).to(BrowserService).inSingletonScope();
container.bind(TYPES.Services.Notifier).to(NotifierService).inSingletonScope();
container.bind(TYPES.Services.Scrape).to(ScrapeService).inSingletonScope();
container.bind(TYPES.Services.Settings).to(SettingsService).inSingletonScope();

// Commands
[
  Admin,
  Delete,
  Edit,
  History,
  List,
  Observe,
  Pause,
  Preview,
  Reactivate,
  Scrape,
  Settings,
].forEach((command) => {
  container.bind<Command>(TYPES.Command).to(command).inSingletonScope();
});

// Config values
container.bind(TYPES.Config).toConstantValue(new Config());

// Static libraries

export default container;
