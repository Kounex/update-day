import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { Client, Collection } from 'discord.js';
import { inject, injectable } from 'inversify';
import ora from 'ora';
import Command from './commands/command.js';
import Config from './config.js';
import handleGuildCreate from './events/guild-create.js';
import container from './inversify.config.js';
import { TYPES } from './types.js';
import debug from './utils/debug.js';
import errorMsg from './utils/error-msg.js';
import registerCommandsOnGuild from './utils/register-commands-on-guild.js';

@injectable()
export default class {
  private readonly shouldRegisterCommandsOnBot: boolean;
  private readonly commandsByName!: Collection<string, Command>;
  private readonly commandsByButtonId!: Collection<string, Command>;

  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Config) private readonly config: Config
  ) {
    this.shouldRegisterCommandsOnBot = config.REGISTER_COMMANDS_ON_BOT;
    this.commandsByName = new Collection();
    this.commandsByButtonId = new Collection();
  }

  public async register(): Promise<void> {
    // Load in commands
    for (const command of container.getAll<Command>(TYPES.Command)) {
      // Make sure we can serialize to JSON without errors
      try {
        command.slashCommand.toJSON();
      } catch (error) {
        console.error(error);
        throw new Error(
          `Could not serialize /${command.slashCommand.name ?? ''} to JSON`
        );
      }

      if (command.slashCommand.name) {
        this.commandsByName.set(command.slashCommand.name, command);
      }

      if (command.handledButtonIds) {
        for (const buttonId of command.handledButtonIds) {
          this.commandsByButtonId.set(buttonId, command);
        }
      }
    }

    // Register event handlers
    // eslint-disable-next-line complexity
    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (interaction.isCommand()) {
          const command = this.commandsByName.get(interaction.commandName);

          if (!command || !interaction.isChatInputCommand()) {
            return;
          }

          if (!interaction.guild) {
            await interaction.reply(errorMsg("you can't use this bot in a DM"));
            return;
          }

          if (command.execute) {
            await command.execute(interaction);
          }
        } else if (interaction.isButton()) {
          const command = this.commandsByButtonId.get(interaction.customId);

          if (!command) {
            return;
          }

          if (command.handleButtonInteraction) {
            await command.handleButtonInteraction(interaction);
          }
        } else if (interaction.isAutocomplete()) {
          const command = this.commandsByName.get(interaction.commandName);

          if (!command) {
            return;
          }

          if (command.handleAutocompleteInteraction) {
            await command.handleAutocompleteInteraction(interaction);
          }
        }
      } catch (error: unknown) {
        debug(error);

        // This can fail if the message was deleted, and we don't want to crash the whole bot
        try {
          if (
            (interaction.isCommand() || interaction.isButton()) &&
            (interaction.replied || interaction.deferred)
          ) {
            await interaction.editReply(errorMsg(error as Error));
          } else if (interaction.isCommand() || interaction.isButton()) {
            await interaction.reply({
              content: errorMsg(error as Error),
              ephemeral: true,
            });
          }
        } catch {}
      }
    });

    const spinner = ora('📡 connecting to Discord...').start();

    this.client.once('ready', async () => {
      // Update commands
      const rest = new REST({ version: '10' }).setToken(
        this.config.DISCORD_TOKEN
      );
      if (this.shouldRegisterCommandsOnBot) {
        spinner.text = '📡 updating commands on bot...';
        await rest.put(Routes.applicationCommands(this.client.user!.id), {
          body: this.commandsByName.map((command) =>
            command.slashCommand.toJSON()
          ),
        });
      } else {
        spinner.text = '📡 updating commands in all guilds...';

        await Promise.all([
          ...this.client.guilds.cache.map(async (guild) => {
            await registerCommandsOnGuild({
              rest,
              guildId: guild.id,
              applicationId: this.client.user!.id,
              commands: this.commandsByName.map((c) => c.slashCommand),
            });
          }),
          // Remove commands registered on bot (if they exist)
          rest.put(Routes.applicationCommands(this.client.user!.id), {
            body: [],
          }),
        ]);
      }

      // Set Bot presence => status as a 'user' in Discord
      this.client.user!.setPresence({
        activities: [
          {
            name: this.config.BOT_ACTIVITY,
            state: this.config.BOT_ACTIVITY,
            type: this.config.BOT_ACTIVITY_TYPE,
          },
        ],
        status: this.config.BOT_STATUS,
      });

      spinner.succeed(
        `Ready! Invite the bot with https://discordapp.com/oauth2/authorize?client_id=${
          this.client.user?.id ?? ''
        }&scope=bot%20applications.commands&permissions=18432`
      );
    });

    this.client.on('error', console.error);
    this.client.on('debug', debug);

    // Handle events
    this.client.on('guildCreate', handleGuildCreate);

    await this.client.login();
  }
}
