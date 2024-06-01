import { REST } from '@discordjs/rest';
import { Client, Guild } from 'discord.js';
import Command from '../commands/command';
import Config from '../config';
import container from '../inversify.config';
import { TYPES } from '../types';
import registerCommandsOnGuild from '../utils/register-commands-on-guild';

export default async (guild: Guild): Promise<void> => {
  const config = container.get<Config>(TYPES.Config);

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

  const owner = await guild.fetchOwner();
  await owner.send(
    "👋 Hi! Someone (probably you) just invited me to a server you own. By default, I'm usable by all guild member in all guild channels. To change this, check out the wiki page on permissions: https://github.com/codetheweb/muse/wiki/Configuring-Bot-Permissions."
  );
};
