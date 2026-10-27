import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import {
  buildCommandResultEmbed,
  buildObserveEmbed,
  buildScrapeReport,
} from '../utils/build-embed.js';
import respondWithObserveNames, {
  toChoices,
} from '../utils/observe-name-autocomplete.js';
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
    .setName('edit')
    .setDescription('Edit one of your existing Observes')
    .addStringOption((option) =>
      option
        .setName('current-name')
        .setDescription('The Observe to edit - everything else is optional')
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      nameOption(option)
        .setName('name')
        .setDescription('New name - leave empty to keep the current one')
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      urlOption(option)
        .setName('url')
        .setDescription('New URL - leave empty to keep the current one')
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      textOption(option)
        .setName('text')
        .setDescription('New text to watch - leave empty to keep the current one')
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      modeOption(option).setDescription(
        'New mode - leave empty to keep the current one'
      )
    )
    .addStringOption((option) =>
      intervalOption(option).setDescription(
        'New scrape interval - leave empty to keep the current one'
      )
    )
    .addStringOption((option) =>
      selectorOption(option)
        .setName('css-selector')
        .setDescription(
          'Narrows the search area; type "none" to remove it and go back to whole page'
        )
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      keepActiveOption(option).setDescription(
        'Keep watching after a change is found - leave empty to keep as-is'
      )
    )
    .addStringOption((option) =>
      notifyOption(option).setDescription(
        'Where to notify you - leave empty to keep as-is'
      )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const currentName = interaction.options.getString('current-name')!;

    // `getString`/`getBoolean` return `null` for an option the user left
    // empty - normalized to `undefined` here so the manager can tell "not
    // provided, keep the current value" apart from an actual value.
    // `css-selector` is the one exception: it also accepts the literal
    // "none" to mean "provided, clear it" (go back to whole-page search).
    const rawCssSelector = interaction.options.getString('css-selector');
    const cssSelectorEdit =
      rawCssSelector === null
        ? undefined
        : rawCssSelector.trim().toLocaleLowerCase() === 'none'
          ? null
          : rawCssSelector;

    // Changing what's watched re-checks the page, which takes a moment.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const result = await this.observeManager.editObserve(
      interaction.guildId!,
      interaction.user.id,
      currentName,
      {
        name: interaction.options.getString('name') ?? undefined,
        url: interaction.options.getString('url') ?? undefined,
        cssSelector: cssSelectorEdit,
        watchText: interaction.options.getString('text') ?? undefined,
        watchMode: interaction.options.getString('mode') ?? undefined,
        notifyMode: interaction.options.getString('notify') ?? undefined,
        scrapeInterval:
          interaction.options.getString('scrape-interval') ?? undefined,
        keepActive: interaction.options.getBoolean('keep-active') ?? undefined,
      }
    );

    if (!result.successful) {
      await interaction.editReply(
        result.scrapeResult && result.observe
          ? buildScrapeReport(result.observe, result.scrapeResult, {
              title: 'Not saved',
              text: result.message ?? 'Something is off with this change.',
              color: 'DarkRed',
            })
          : { embeds: [buildCommandResultEmbed(result)] }
      );
      return;
    }

    const observe = result.observe!;
    if (result.scrapeResult) {
      const report = buildScrapeReport(observe, result.scrapeResult, {
        title: 'What the bot sees now',
        text: 'The new target was checked once - this is the new starting point.',
        color: 'DarkBlue',
      });
      await interaction.editReply({
        content: `✅ \`${observe.name}\` updated.`,
        embeds: [buildObserveEmbed(observe), ...report.embeds],
        files: report.files,
      });
    } else {
      await interaction.editReply({
        content: `✅ \`${observe.name}\` updated.`,
        embeds: [buildObserveEmbed(observe)],
      });
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);
    if (focusedOption.name === 'current-name') {
      await respondWithObserveNames(interaction, this.observeManager);
      return;
    }

    // For the other fields, offer the current value to start editing from.
    const currentName = interaction.options.getString('current-name');
    const observe = currentName
      ? await this.observeManager.findByName(
          interaction.guildId!,
          interaction.user.id,
          currentName
        )
      : undefined;

    const current = {
      name: observe?.name,
      url: observe?.url,
      text: observe?.watchText,
      'css-selector': observe?.cssSelector,
    }[focusedOption.name];

    await interaction.respond(toChoices(current ? [current] : []));
  }
}
