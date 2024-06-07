import { Client, GatewayIntentBits } from 'discord.js';
import { Container } from 'inversify';
import 'reflect-metadata';
import Bot from './bot';
import Config from './config';
import { TYPES } from './types';

// Managers
import ObserveManager from './managers/observe';
import SchedulerManager from './managers/scheduler';

// Services
import ScrapeService from './services/scrape';

// Commands
import Command from './commands/command';
import Delete from './commands/delete';
import Edit from './commands/edit';
import List from './commands/list';
import Observe from './commands/observe';

const container = new Container();

// Intents
const intents: GatewayIntentBits[] = [];
intents.push(GatewayIntentBits.Guilds); // To listen for guildCreate event
intents.push(GatewayIntentBits.GuildMessageReactions); // To listen for message reactions (messageReactionAdd event)
intents.push(GatewayIntentBits.GuildVoiceStates); // To listen for voice state changes (voiceStateUpdate event)

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
container.bind(TYPES.Services.Scrape).to(ScrapeService).inSingletonScope();

// Commands
[Delete, Edit, List, Observe].forEach((command) => {
  container.bind<Command>(TYPES.Command).to(command).inSingletonScope();
});

// Config values
container.bind(TYPES.Config).toConstantValue(new Config());

// Static libraries

export default container;
