import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import {
 Client, Collection, Events, MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ora from 'ora';
import Command from './commands/command.js';
import Config from './config.js';
import handleGuildCreate from './events/guild-create.js';
import container from './inversify.config.js';
import ObserveManager from './managers/observe.js';
import { TYPES } from './types.js';
import errorMsg from './utils/error-msg.js';
import logger from './utils/logger.js';
import registerCommandsOnGuild from './utils/register-commands-on-guild.js';

// View Channel, Send Messages, Embed Links, Attach Files (screenshots)
const INVITE_PERMISSIONS = 1024 + 2048 + 16384 + 32768;

@injectable()
export default class {
  private readonly shouldRegisterCommandsOnBot: boolean;
  private readonly commandsByName!: Collection<string, Command>;
  private readonly commandsByComponentId!: Collection<string, Command>;
  private readonly commandsByModalId!: Collection<string, Command>;

  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Config) private readonly config: Config
  ) {
    this.shouldRegisterCommandsOnBot = config.REGISTER_COMMANDS_ON_BOT;
    this.commandsByName = new Collection();
    this.commandsByComponentId = new Collection();
    this.commandsByModalId = new Collection();
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

      for (const prefix of command.handledComponentIds ?? []) {
        this.commandsByComponentId.set(prefix, command);
      }

      for (const prefix of command.handledModalIds ?? []) {
        this.commandsByModalId.set(prefix, command);
      }
    }

    // Register event handlers
    // eslint-disable-next-line complexity
    this.client.on(Events.InteractionCreate, async (interaction) => {
      try {
        if (interaction.isCommand()) {
          const command = this.commandsByName.get(interaction.commandName);

          if (!command || !interaction.isChatInputCommand()) {
            return;
          }

          if (!interaction.guild) {
            await interaction.reply(errorMsg('you can\'t use this bot in a DM'));
            return;
          }

          if (!this.config.isGuildAllowed(interaction.guild.id)) {
            await interaction.reply({
              content: errorMsg('this bot is not enabled for this server'),
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await command.execute(interaction);
        } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
          // handledComponentIds entries are prefixes, not exact IDs - a
          // component needing per-interaction data (e.g. which Observe)
          // encodes it as `${prefix}${data}` in its own customId. Buttons also
          // arrive from DMs (notifications); handlers check ownership.
          const command = this.commandsByComponentId.find((_command, prefix) =>
            interaction.customId.startsWith(prefix)
          );

          if (interaction.isButton()) {
            await command?.handleButtonInteraction?.(interaction);
          } else {
            await command?.handleSelectMenuInteraction?.(interaction);
          }
        } else if (interaction.isModalSubmit()) {
          const command = this.commandsByModalId.find((_command, prefix) =>
            interaction.customId.startsWith(prefix)
          );
          await command?.handleModalSubmitInteraction?.(interaction);
        } else if (interaction.isAutocomplete()) {
          if (
            !interaction.guildId ||
            !this.config.isGuildAllowed(interaction.guildId)
          ) {
            await interaction.respond([]);
            return;
          }

          const command = this.commandsByName.get(interaction.commandName);

          if (command?.handleAutocompleteInteraction) {
            await command.handleAutocompleteInteraction(interaction);
          }
        }
      } catch (error: unknown) {
        logger.error(
          `Interaction ${
            interaction.isCommand()
              ? `/${interaction.commandName}`
              : interaction.isMessageComponent() || interaction.isModalSubmit()
                ? `component ${interaction.customId}`
                : String(interaction.type)
          } failed`,
          error
        );

        // This can fail if the message was deleted, and we don't want to crash the whole bot
        try {
          if (
            interaction.isRepliable() &&
            (interaction.replied || interaction.deferred)
          ) {
            await interaction.followUp({
              content: errorMsg(error as Error),
              flags: MessageFlags.Ephemeral,
            });
          } else if (interaction.isRepliable()) {
            await interaction.reply({
              content: errorMsg(error as Error),
              flags: MessageFlags.Ephemeral,
            });
          }
        } catch {}
      }
    });

    const spinner = ora('📡 connecting to Discord...').start();

    this.client.once(Events.ClientReady, async () => {
      try {
        await this.onReady(spinner);
      } catch (error: unknown) {
        spinner.fail('Setting up after connecting to Discord failed');
        logger.error('Ready handler failed', error);
      }
    });

    this.client.on(Events.GuildCreate, (guild) => {
      handleGuildCreate(guild).catch((error: unknown) => {
        logger.error(`Setting up guild ${guild.id} failed`, error);
      });
    });

    // The bot was kicked or left: stop checking that server's Observes, but
    // keep them in case it's added back.
    this.client.on(Events.GuildDelete, (guild) => {
      container
        .get<ObserveManager>(TYPES.Managers.Observe)
        .deactivateGuild(guild.id)
        .then((count) => {
          logger.info(`Left guild ${guild.id}, deactivated ${count} Observes`);
        })
        .catch((error: unknown) => {
          logger.error(`Could not deactivate the Observes of guild ${guild.id}`, error);
        });
    });

    this.client.on(Events.Error, (error) => {
      logger.error('Discord client error', error);
    });
    this.client.on(Events.Debug, (message) => {
      logger.debug(message);
    });

    await this.client.login();
  }

  private async onReady(spinner: ReturnType<typeof ora>): Promise<void> {
    // An allowlist set after the bot already joined other servers.
    await Promise.all(
      this.client.guilds.cache
        .filter((guild) => !this.config.isGuildAllowed(guild.id))
        .map(async (guild) => {
          logger.warn(`Leaving guild ${guild.id} (${guild.name}): not in ALLOWED_GUILD_IDS`);
          await guild.leave().catch((error: unknown) => {
            logger.error(`Could not leave guild ${guild.id}`, error);
          });
        })
    );

    // Update commands
    const rest = new REST({ version: '10' }).setToken(this.config.DISCORD_TOKEN);
    if (this.shouldRegisterCommandsOnBot) {
      spinner.text = '📡 updating commands on bot...';
      await rest.put(Routes.applicationCommands(this.client.user!.id), {
        body: this.commandsByName.map((command) => command.slashCommand.toJSON()),
      });
    } else {
      spinner.text = '📡 updating commands in all guilds...';

      await Promise.all([
        ...this.client.guilds.cache
          .filter((guild) => this.config.isGuildAllowed(guild.id))
          .map(async (guild) => {
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
      }&scope=bot%20applications.commands&permissions=${INVITE_PERMISSIONS}`
    );
  }
}
