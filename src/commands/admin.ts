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

        // `getBoolean` returns `null` when the user left the option empty,
        // which must fall back to each option's documented default (true)
        // rather than to "unfiltered" - otherwise an admin running this with
        // no arguments would see every guild's Observes (including inactive
        // ones), not just their own guild's active ones as advertised.
        const thisGuild = interaction.options.getBoolean('this-guild') ?? true;
        const activeOnly =
          interaction.options.getBoolean('active-only') ?? true;

        const observes = await this.observeManager.getObserves({
          guildId: thisGuild ? interaction.guildId! : undefined,
          active: activeOnly ? true : undefined,
        });

        const embed = await buildObserveOverview(
          observes,
          activeOnly,
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
