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
          'Website URL to Observe | e.g. https://www.lttstore.com/products/screwdriver-t-shirt'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription(
          'Text currently on the page (e.g. "coming soon") - you will be notified once it is no longer found'
        )
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('scrape-interval')
        .setDescription(
          'How often to check | Hourly is the default'
        )
        .setChoices(
          ScrapeInterval.enumValues.map((type) => {
            return {
              name: ScrapeInterval.enumText(type),
              value: type,
            };
          })
        )
    )
    .addStringOption((option) =>
      option
        .setName('css-selector')
        .setDescription(
          'Narrows the search area, useful if the text could also appear elsewhere on the page'
        )
    )
    .addBooleanOption((option) =>
      option
        .setName('keep-active')
        .setDescription(
          'Keep watching after a change is found, instead of auto-deactivating - false by default'
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
      interaction.options.getString('css-selector'),
      interaction.options.getString('text')!,
      interaction.options.getString('scrape-interval'),
      interaction.options.getBoolean('keep-active') ?? false
    );

    if (observe instanceof Observe) {
      await interaction.deferReply({ ephemeral: true });

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
