import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import {
  actionRow,
  buildCommandResultEmbed,
  buildObserveEmbed,
  buildObserveListEmbed,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('list')
    .setDescription('List your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription(
          'If you only want to see a specific Observe, will show all by default'
        )
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('active-only')
        .setDescription(
          'If you only want to see your active Observes, true by default'
        )
    )
    .addBooleanOption((option) =>
      option
        .setName('compact')
        .setDescription(
          'If you want to see your Observes in a compact list, true by default'
        )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name');
    const activeOnly = interaction.options.getBoolean('active-only') ?? true;
    const compact = interaction.options.getBoolean('compact') ?? true;

    if (name === null) {
      const observes = await this.observeManager.getObserves({
        guildId: interaction.guildId!,
        userId: interaction.user.id,
      });
      await interaction.reply({
        embeds: [buildObserveListEmbed(observes, activeOnly, compact)],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const observe = await this.observeManager.findByName(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    if (observe) {
      await interaction.reply({
        embeds: [buildObserveEmbed(observe, { color: 'DarkBlue' })],
        components: [actionRow(observe)],
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `You don't have an Observe called \`${name}\`. Pick one from the suggestions, or leave \`name\` empty to see all of them.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager);
  }
}
