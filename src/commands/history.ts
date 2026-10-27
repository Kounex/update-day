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
  buildCommandResultEmbed,
  buildHistoryEmbed,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('history')
    .setDescription('Show the latest checks of one of your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe')
        .setAutocomplete(true)
        .setRequired(true)
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;
    const observe = await this.observeManager.findByName(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    if (!observe) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `You don't have an Observe called \`${name}\` - check \`/list\`.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      embeds: [
        buildHistoryEmbed(observe, await this.observeManager.getHistory(observe, 25)),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager);
  }
}
