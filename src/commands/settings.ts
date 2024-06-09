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
