import { REST } from '@discordjs/rest';
import { Client, Guild } from 'discord.js';
import Command from '../commands/command.js';
import Config from '../config.js';
import container from '../inversify.config.js';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import logger from '../utils/logger.js';
import registerCommandsOnGuild from '../utils/register-commands-on-guild.js';

export default async (guild: Guild): Promise<void> => {
  const config = container.get<Config>(TYPES.Config);

  if (!config.isGuildAllowed(guild.id)) {
    logger.warn(`Invited to guild ${guild.id} (${guild.name}), which is not in ALLOWED_GUILD_IDS - leaving`);
    await guild.leave();
    return;
  }

  logger.info(`Joined guild ${guild.id} (${guild.name})`);
  await container
    .get<SettingsService>(TYPES.Services.Settings)
    .createSettings(guild.id);

  // Setup slash commands
  if (!config.REGISTER_COMMANDS_ON_BOT) {
    const client = container.get<Client>(TYPES.Client);

    const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

    await registerCommandsOnGuild({
      rest,
      applicationId: client.user!.id,
      guildId: guild.id,
      commands: container
        .getAll<Command>(TYPES.Command)
        .map((command) => command.slashCommand),
    });
  }

  try {
    const owner = await guild.fetchOwner();
    await owner.send(
      '👋 Hi! Someone (probably you) just invited me to a server you own. By default, I\'m usable by all guild members in all guild channels, aside from the `/admin` and `/settings` commands, which are restricted to members with the Manage Server permission. To further restrict access, adjust this bot\'s integration permissions in your server\'s settings.'
    );
  } catch (error: unknown) {
    // Owners with closed DMs are common - not worth failing the setup.
    logger.warn(`Could not DM the owner of guild ${guild.id}`, error);
  }
};
