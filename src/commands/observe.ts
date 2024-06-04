import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeManager from '../managers/scrape';
import { TYPES } from '../types';
import { Observe } from '../types/models/observe';
import {
  buildCommandResultEmbed,
  buildObserveEmbed,
} from '../utils/build-embed';
import Command from './command';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('observe')
    .setDescription('Observe a website')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name so you can recognize and manage it later')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription(
          'Website URL to observe | e.g. https://www.lttstore.com/products/screwdriver-t-shirt'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('css-selector')
        .setDescription('CSS-Selector to look out for | e.g. #kbis-anchor > a')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('current-text')
        .setDescription(
          'Text found with CSS-Selector (if this changes or element not found, you will get notified)'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('dom-element-property')
        .setDescription(
          'By default, the bot will check the `innerText`, can also be href, data, value etc.'
        )
    );

  constructor(
    @inject(TYPES.Managers.Scrape) private readonly scrapeManager: ScrapeManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const observe = Observe.create(
      interaction.user.id,
      Date.now(),
      Date.now(),
      interaction.options.getString('name')!,
      interaction.options.getString('url')!,
      interaction.options.getString('css-selector')!,
      interaction.options.getString('current-text')!,
      interaction.options.getString('dom-element-property')
    );

    if (observe instanceof Observe) {
      const result = await this.scrapeManager.addObserve(observe);

      if (result.successful) {
        await interaction.reply({
          embeds: [buildObserveEmbed(observe)],
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: false,
              message: result.message,
            }),
          ],
          ephemeral: true,
        });
      }
    } else {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: observe.message,
          }),
        ],
        ephemeral: true,
      });
    }
  }
}
