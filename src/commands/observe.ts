import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ChatInputCommandInteraction,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { NotifyMode, Observe } from '../types/models/observe.js';
import {
  actionRow,
  buildCommandResultEmbed,
  buildObserveEmbed,
  buildScrapeReport,
} from '../utils/build-embed.js';
import Command from './command.js';
import {
  intervalOption,
  keepActiveOption,
  modeOption,
  nameOption,
  notifyOption,
  selectorOption,
  textOption,
  urlOption,
} from './options.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('observe')
    .setDescription('Watch a web page and get notified when it changes')
    .addStringOption((option) =>
      nameOption(option)
        .setName('name')
        .setDescription('Name so you can recognize and manage it later')
        .setRequired(true)
    )
    .addStringOption((option) =>
      urlOption(option)
        .setName('url')
        .setDescription('Page to watch, e.g. https://shop.example.com/products/thing')
        .setRequired(true)
    )
    .addStringOption((option) =>
      textOption(option)
        .setName('text')
        .setDescription(
          'Text to watch, e.g. "sold out" - needed unless the mode is "Content changes"'
        )
    )
    .addStringOption((option) =>
      modeOption(option).setDescription(
        'What counts as a change - "Text disappears" by default'
      )
    )
    .addStringOption((option) =>
      intervalOption(option).setDescription('How often to check - Hourly by default')
    )
    .addStringOption((option) =>
      selectorOption(option)
        .setName('css-selector')
        .setDescription(
          'Only look inside this part of the page, e.g. if the text also appears elsewhere'
        )
    )
    .addBooleanOption((option) =>
      keepActiveOption(option).setDescription(
        'Keep watching after a change was found, instead of going inactive - false by default'
      )
    )
    .addStringOption((option) =>
      notifyOption(option).setDescription(
        'Where to notify you - a direct message by default'
      )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const observe = Observe.create({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
      channelId: interaction.channelId,
      name: interaction.options.getString('name')!,
      url: interaction.options.getString('url')!,
      watchText: interaction.options.getString('text'),
      watchMode: interaction.options.getString('mode'),
      scrapeInterval: interaction.options.getString('scrape-interval'),
      cssSelector: interaction.options.getString('css-selector'),
      keepActive: interaction.options.getBoolean('keep-active'),
      notifyMode: interaction.options.getString('notify'),
    });

    if (!(observe instanceof Observe)) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({ successful: false, message: observe.message }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      observe.notifyMode !== NotifyMode.DM &&
      !interaction.appPermissions.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ])
    ) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message:
              'I can\'t post in this channel, so I couldn\'t notify you here. Run this in a channel I can write in, or use `notify: Direct message`.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Checking the page can take a while (it's loaded for real).
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await this.observeManager.addObserve(observe);

    if (!result.scrapeResult) {
      await interaction.editReply({
        embeds: [buildCommandResultEmbed(result)],
      });
      return;
    }

    if (!result.successful) {
      const report = buildScrapeReport(observe, result.scrapeResult, {
        title: 'Not saved',
        text: result.message ?? 'Something is off with this Observe.',
        color: 'DarkRed',
      });
      await interaction.editReply(report);
      return;
    }

    const report = buildScrapeReport(observe, result.scrapeResult, {
      title: 'What the bot sees right now',
      text: 'The page was checked once - this is the starting point.',
      color: 'DarkBlue',
    });
    await interaction.editReply({
      content: `✅ Now watching \`${observe.name}\`.`,
      embeds: [buildObserveEmbed(result.observe!), ...report.embeds],
      files: report.files,
      components: [actionRow(result.observe!)],
    });
  }
}
