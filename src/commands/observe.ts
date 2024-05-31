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
    .setName('observe')
    .setDescription('Observe a website')
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('Website URL')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('css-selector')
        .setDescription('CSS-Selector to look out for')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('current-text')
        .setDescription(
          'What text is currently behind the CSS-Selector (if this changes, you will get notified)'
        )
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('dom-element-property')
        .setDescription(
          'By default, the bot will check the `innerText` of the element behind the CSS-Selector, here you can define another property to look out for (like data, href etc.)'
        )
    );

  private readonly scrapeManager: ScrapeManager;

  constructor(@inject(TYPES.Managers.Scrape) scrapeManager: ScrapeManager) {
    this.scrapeManager = scrapeManager;
  }

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const url = interaction.options.getString('url')!;
    const cssSelector = interaction.options.getString('css-selector')!;
    const currentText = interaction.options.getString('current-text')!;
    const domElementProperty = interaction.options.getString(
      'dom-element-property'
    );

    // Add scrape logic
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    switch (interaction.commandName) {
      case 'url': {
        // const url = interaction.options.getString('url')?.trim();

        // if (!url || url.length === 0) {
        //   await interaction.respond([]);
        //   return;
        // }

        // await interaction.respond(['https://discogs.com']);
        break;
      }
      case 'css-selector': {
        break;
      }
      case 'current-text': {
        break;
      }
      case 'dom-element-property': {
        break;
      }
    }

    await interaction.respond([]);
  }
}
