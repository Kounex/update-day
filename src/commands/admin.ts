import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  Client,
  PermissionFlagsBits,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { buildObserveOverview } from '../utils/build-embed.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Admin commands')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list-observes')
        .setDescription('Get all Observes managed by this bot')
        .addBooleanOption((option) =>
          option
            .setName('this-guild')
            .setDescription(
              'If you want to only list the Observes in this guild, true by default'
            )
        )
        .addBooleanOption((option) =>
          option
            .setName('active-only')
            .setDescription(
              'If you want to only list the Observes which are active, true by default'
            )
        )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Client)
    private readonly client: Client
  ) {}

  async execute(interaction: ChatInputCommandInteraction) {
    switch (interaction.options.getSubcommand()) {
      case 'list-observes': {
        await interaction.deferReply({ ephemeral: true });

        const thisGuild = interaction.options.getBoolean('this-guild');
        const activeOnly = interaction.options.getBoolean('active-only');

        const observes = await this.observeManager.getObserves({
          guildId: thisGuild != null ? interaction.guildId! : undefined,
          active: activeOnly ?? undefined,
        });

        const embed = await buildObserveOverview(
          observes,
          activeOnly ?? false,
          this.client
        );

        await interaction.followUp({
          embeds: [embed],
          ephemeral: true,
        });

        break;
      }

      default:
        throw new Error('Unknown subcommand!');
    }
  }
}
