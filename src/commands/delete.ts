import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeManager from '../managers/scrape';
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
    @inject(TYPES.Managers.Scrape) private readonly scrapeManager: ScrapeManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;

    const commandResult = this.scrapeManager.deleteObserve(
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
    let observers = this.scrapeManager.observers.filter(
      (observe) => observe.userId == interaction.user.id
    );

    const userText = interaction.options.getFocused();

    if (userText.trim().length > 0) {
      observers = observers.filter((observe) =>
        observe.name
          .toLocaleLowerCase()
          .trim()
          .includes(userText.toLocaleLowerCase().trim())
      );
    }

    await interaction.respond(
      observers.map((observe) => ({ name: observe.name, value: observe.name }))
    );
  }
}
