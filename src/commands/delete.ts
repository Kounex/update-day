import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeManager from '../managers/scrape';
import { TYPES } from '../types';
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

  private readonly scrapeManager: ScrapeManager;

  constructor(@inject(TYPES.Managers.Scrape) scrapeManager: ScrapeManager) {
    this.scrapeManager = scrapeManager;
  }

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name');

    if (this.scrapeManager.deleteObserve(interaction.user.id, name)) {
      await interaction.reply({
        content: 'Deleted.',
        // embeds: [buildObserveEmbed(observe)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'No observe with this name found, so nothing got deleted.',
        // embeds: [buildObserveEmbed(observe)],
        ephemeral: true,
      });
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    let observers = this.scrapeManager.observers.filter(
      (observe) => observe.userId == interaction.user.id
    );

    const userText = interaction.options.getFocused();

    if (userText.length > 0) {
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
