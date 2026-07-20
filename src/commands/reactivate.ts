import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { buildCommandResultEmbed } from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('reactivate')
    .setDescription('Reactivate one of your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to reactivate')
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

    const commandResult = await this.observeManager.reactivateObserve(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    await interaction.reply({
      embeds: [buildCommandResultEmbed(commandResult)],
      ephemeral: true,
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager, {
      filter: (observe) => !observe.active,
    });
  }
}
