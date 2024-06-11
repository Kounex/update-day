import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction, PermissionFlagsBits } from 'discord.js';
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
          'Set the time the scraper will wait before hitting a timeout (in seconds)'
        )
        .addIntegerOption((option) =>
          option
            .setName('timeout')
            .setDescription('Timeout in seconds')
            .setMinValue(1)
            .setMinValue(60)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set-timeout-limit')
        .setDescription(
          'Set the maximum amount of consecutive timeouts for Observes until they get deactivated'
        )
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Maximum consecutive timeouts per Observe')
            .setMinValue(1)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand.setName('list').setDescription('Show all settings')
    );

  constructor(
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  async execute(interaction: ChatInputCommandInteraction) {
    // Ensure guild settings exist before trying to update
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
          ephemeral: true,
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
          ephemeral: true,
        });

        break;
      }

      case 'set-timeout': {
        const timeout = interaction.options.getInteger('timeout')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          timeout: timeout,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `New Observe timeout has been set to \`${timeout} seconds\``,
            }),
          ],
          ephemeral: true,
        });

        break;
      }

      case 'set-timeout-limit': {
        const limit = interaction.options.getInteger('limit')!;

        await this.settingsService.updateSettings(interaction.guildId!, {
          timeoutLimit: limit,
        });

        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: true,
              message: `New Observe consecutive timeout limit has been set to \`${limit}\``,
            }),
          ],
          ephemeral: true,
        });

        break;
      }

      case 'list': {
        await interaction.reply({
          embeds: [buildSettingsEmbed(settings)],
          ephemeral: true,
        });

        break;
      }

      default:
        throw new Error('Unknown subcommand!');
    }
  }
}
