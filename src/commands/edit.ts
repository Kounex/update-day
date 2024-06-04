import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeManager from '../managers/scrape';
import { TYPES } from '../types';
import { Observe } from '../types/models/observe';
import { buildCommandResultEmbed } from '../utils/build-embed';
import Command from './command';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('edit')
    .setDescription('Edit one of your existing observes')
    .addStringOption((option) =>
      option
        .setName('current-name')
        .setDescription('Name so you can recognize and manage it later')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name so you can recognize and manage it later')
        .setAutocomplete(true)
        .setRequired(true)
    )
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
          'By default, the bot will check the `innerText`, can also be href, data, value etc.'
        )
    );

  private readonly scrapeManager: ScrapeManager;

  constructor(@inject(TYPES.Managers.Scrape) scrapeManager: ScrapeManager) {
    this.scrapeManager = scrapeManager;
  }

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const currentName = interaction.options.getString('current-name')!;
    const name = interaction.options.getString('name')!;
    const url = interaction.options.getString('url')!;
    const cssSelector = interaction.options.getString('css-selector')!;
    const currentText = interaction.options.getString('current-text')!;
    const domElementProperty = interaction.options.getString(
      'dom-element-property',
      false
    );

    const observe = new Observe(
      interaction.user.id,
      Date.now(),
      Date.now(),
      name,
      url,
      cssSelector,
      currentText,
      domElementProperty
    );

    const commandResult = this.scrapeManager.editObserve(currentName, observe);

    await interaction.reply({
      embeds: [buildCommandResultEmbed(commandResult)],
      ephemeral: true,
    });

    // if (commandResult.successful) {
    //   await interaction.reply({
    //     content: '',
    //     embeds: [buildObserveEmbed(observe)],
    //     ephemeral: true,
    //   });
    // } else {
    //   await interaction.reply({
    //     embeds: [buildCommandResultEmbed(commandResult)],
    //     ephemeral: true,
    //   });
    // }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    var options: string[] = [];
    const currentName = interaction.options.getString('current-name');
    const focusedOption = interaction.options.getFocused(true);

    switch (focusedOption.name) {
      case 'current-name': {
        options = this.scrapeManager.observers
          .filter((observe) => observe.userId == interaction.user.id)
          .map((observe) => observe.name);
        break;
      }
      case 'name': {
        if (currentName != null) {
          const observe = this.scrapeManager.observers.find(
            (observe) =>
              observe.userId == interaction.user.id &&
              observe.name == currentName
          );
          if (!!observe) {
            options = [observe!.name];
          }
        }
        break;
      }
      case 'url': {
        if (currentName != null) {
          const observe = this.scrapeManager.observers.find(
            (observe) =>
              observe.userId == interaction.user.id &&
              observe.name == currentName
          );
          if (!!observe) {
            options = [observe!.url];
          }
        }
        break;
      }
      case 'css-selector': {
        if (currentName != null) {
          const observe = this.scrapeManager.observers.find(
            (observe) =>
              observe.userId == interaction.user.id &&
              observe.name == currentName
          );
          if (!!observe) {
            options = [observe!.cssSelector];
          }
        }
        break;
      }
      case 'current-text': {
        if (currentName != null) {
          const observe = this.scrapeManager.observers.find(
            (observe) =>
              observe.userId == interaction.user.id &&
              observe.name == currentName
          );
          if (!!observe) {
            options = [observe!.currentText];
          }
        }
        break;
      }
      case 'dom-element-property': {
        if (currentName != null) {
          const observe = this.scrapeManager.observers.find(
            (observe) =>
              observe.userId == interaction.user.id &&
              observe.name == currentName
          );
          if (!!observe) {
            options =
              observe!.domElementProperty != null
                ? [observe!.domElementProperty!]
                : [];
          }
        }
        break;
      }
    }

    await interaction.respond(
      options.map((option) => ({ name: option, value: option }))
    );
  }
}
