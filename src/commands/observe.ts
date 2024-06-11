import { SlashCommandBuilder } from '@discordjs/builders';
import { ChatInputCommandInteraction } from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { Observe, ScrapeInterval } from '../types/models/observe.js';
import {
  buildCommandResultEmbed,
  buildObserveEmbed,
} from '../utils/build-embed.js';
import Command from './command.js';

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
        .setName('scrape-interval')
        .setDescription(
          'Set the interval the bot should scrape your observe | Hourly is the default'
        )
        .setChoices(
          ScrapeInterval.enumValues.map((type) => {
            return {
              name: ScrapeInterval.enumText(type),
              value: type,
            };
          })
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('dom-element-property')
        .setDescription(
          'By default, the bot will check the `innerText`, can also be href, data, value etc.'
        )
    )
    .addBooleanOption((option) =>
      option
        .setName('keep-active')
        .setDescription(
          'If you want to deactivate the observe once it found a change, true by default'
        )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const observe = Observe.create(
      interaction.guildId!,
      interaction.user.id!,
      Date.now(),
      0,
      interaction.options.getString('name')!,
      interaction.options.getString('url')!,
      interaction.options.getString('css-selector')!,
      interaction.options.getString('current-text')!,
      interaction.options.getString('scrape-interval'),
      interaction.options.getString('dom-element-property'),
      interaction.options.getBoolean('keep-active') ?? false
    );

    if (observe instanceof Observe) {
      interaction.deferReply({ ephemeral: true });

      const result = await this.observeManager.addObserve(observe);

      if (result.successful) {
        await interaction.followUp({
          embeds: [buildObserveEmbed(observe)],
          ephemeral: true,
        });
      } else {
        await interaction.followUp({
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
