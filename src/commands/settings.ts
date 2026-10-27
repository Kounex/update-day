import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import {
  buildCommandResultEmbed,
  buildSettingsEmbed,
} from '../utils/build-embed.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Configure bot settings')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-guild-observe-limit')
        .setDescription('Set the maximum amount of Observes per guild (server)')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Maximum Observes per guild')
            .setMinValue(0)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-user-observe-limit')
        .setDescription('Set the maximum amount of Observes per user')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Maximum Observes per user')
            .setMinValue(0)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-timeout')
        .setDescription(
          'How long a page may take to load before the check counts as failed (in seconds)'
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout')
            .setDescription('Timeout in seconds')
            .setMinValue(1)
            .setMaxValue(60)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-timeout-limit')
        .setDescription(
          'How many failed checks in a row deactivate an Observe'
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Failed checks in a row')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('timeouts-till-notify')
        .setDescription(
          'After how many failed checks in total users get a heads-up'
        )
        .addIntegerOption((option) =>
          option
            .setName('amount')
            .setDescription('Failed checks in total')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('notify-on-first-timeout')
        .setDescription(
          'Notify users about a first failed check (not just at the limit) - false by default'
        )
        .addBooleanOption((option) =>
          option
            .setName('notify')
            .setDescription('Should notify on the first failed check')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-notify-channel')
        .setDescription(
          'Channel for channel notifications - leave empty to use the channel each Observe was created in'
        )
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Text channel to post notifications in')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('Show all settings')
    );

  constructor(
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService,
    @inject(TYPES.Client)
    private readonly client: Client
  ) {}

  async execute(interaction: ChatInputCommandInteraction) {
    const settings = await this.settingsService.getSettings(
      interaction.guildId!
    );

    switch (interaction.options.getSubcommand()) {
      case 'set-guild-observe-limit': {
        const limit = interaction.options.getInteger('limit')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          guildObserveLimit: limit,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `New Observe limit for guilds has been set to \`${limit}\``,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'set-user-observe-limit': {
        const limit = interaction.options.getInteger('limit')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          userObserveLimit: limit,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `New Observe limit for users has been set to \`${limit}\``,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'set-timeout': {
        const timeout = interaction.options.getInteger('timeout')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          timeout,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `Pages may now take up to \`${timeout} seconds\` to load.`,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'set-timeout-limit': {
        const limit = interaction.options.getInteger('limit')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          consecutiveTimeoutsLimit: limit,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `Observes are now deactivated after \`${limit}\` failed checks in a row.`,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'timeouts-till-notify': {
        const amount = interaction.options.getInteger('amount')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          timeoutsTillNotify: amount,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `Users now get a heads-up once an Observe has failed \`${amount}\` checks in total.`,
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'notify-on-first-timeout': {
        const notify = interaction.options.getBoolean('notify')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          notifyOnFirstTimeout: notify,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: notify
                ? 'Users are now notified about the first failed check of an Observe.'
                : 'Users are only notified about failed checks once an Observe gets deactivated (or hits the total limit).',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'set-notify-channel': {
        const channel = interaction.options.getChannel('channel');
        if (channel) {
          const guildChannel = await interaction.guild!.channels.fetch(channel.id);
          const canPost = guildChannel
            ?.permissionsFor(this.client.user!)
            ?.has([
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.EmbedLinks,
            ]);
          if (!canPost) {
            await interaction.reply({
              embeds: [
                buildCommandResultEmbed({
                  successful: false,
                  message: `I can't post in <#${channel.id}> - give me View Channel, Send Messages and Embed Links there first (Attach Files too, for screenshots).`,
                }),
              ],
              flags: MessageFlags.Ephemeral,
            });
            break;
          }
        }

        await this.settingsService.updateSettings(interaction.guildId!, {
          notifyChannelId: channel?.id ?? null,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: channel
                ? `Channel notifications now go to <#${channel.id}>.`
                : 'Channel notifications now go to the channel each Observe was created in.',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      case 'list': {
        await interaction.reply({
          embeds: [buildSettingsEmbed(settings)],
          flags: MessageFlags.Ephemeral,
        });

        break;
      }

      default:
        throw new Error('Unknown subcommand!');
    }
  }
}
