import { Client, GatewayIntentBits } from 'discord.js';
import { Container } from 'inversify';
import 'reflect-metadata';
import Bot from './bot';
import ConfigProvider from './services/config';
import { TYPES } from './types';

// Managers
import ScrapeManager from './managers/scrape';

// Services

// Commands
import Command from './commands/command';
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
  .bind<ScrapeManager>(TYPES.Managers.Scrape)
  .to(ScrapeManager)
  .inSingletonScope();

// Services

// Commands
[Observe].forEach((command) => {
  container.bind<Command>(TYPES.Command).to(command).inSingletonScope();
});

// Config values
container.bind(TYPES.Config).toConstantValue(new ConfigProvider());

// Static libraries

export default container;
