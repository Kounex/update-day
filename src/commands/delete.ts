import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe';
import { TYPES } from '../types';
import { buildCommandResultEmbed } from '../utils/build-embed';
import Command from './command';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete on of your observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your observe to delete')
        .setAutocomplete(true)
        .setRequired(true)
    );

  constructor(
    @inject(TYPES.Managers.Scrape)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;

    const commandResult = await this.observeManager.deleteObserve(
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
    var observes = await this.observeManager.getObserves(interaction.user.id);

    const userText = interaction.options.getFocused();

    if (userText.trim().length > 0) {
      observes = observes.filter((observe) =>
        observe.name
          .toLocaleLowerCase()
          .trim()
          .includes(userText.toLocaleLowerCase().trim())
      );
    }

    await interaction.respond(
      observes.map((observe) => ({ name: observe.name, value: observe.name }))
    );
  }
}
