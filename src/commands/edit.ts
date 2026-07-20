import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { ScrapeInterval } from '../types/models/observe.js';
import {
  buildCommandResultEmbed,
  buildObserveEmbed,
} from '../utils/build-embed.js';
import Command from './command.js';

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
      option
        .setName('name')
        .setDescription('New name - leave empty to keep the current one')
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('New URL - leave empty to keep the current one')
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription(
          'New text to watch for - leave empty to keep the current one'
        )
        .setAutocomplete(true)
    )
    .addStringOption((option) =>
      option
        .setName('scrape-interval')
        .setDescription('New scrape interval - leave empty to keep the current one')
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
          'Narrows the search area; type "none" to remove it and go back to whole page'
        )
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('keep-active')
        .setDescription('Keep active once a change is found - leave empty to keep as-is')
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
      rawCssSelector == null
        ? undefined
        : rawCssSelector.trim().toLocaleLowerCase() === 'none'
          ? null
          : rawCssSelector;

    const commandResult = await this.observeManager.editObserve(
      interaction.guildId!,
      interaction.user.id,
      currentName,
      {
        name: interaction.options.getString('name') ?? undefined,
        url: interaction.options.getString('url') ?? undefined,
        cssSelector: cssSelectorEdit,
        watchText: interaction.options.getString('text') ?? undefined,
        scrapeInterval:
          interaction.options.getString('scrape-interval') ?? undefined,
        keepActive: interaction.options.getBoolean('keep-active') ?? undefined,
      }
    );

    if (commandResult.successful) {
      await interaction.reply({
        embeds: [buildObserveEmbed(commandResult.observe!)],
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        embeds: [buildCommandResultEmbed(commandResult)],
        ephemeral: true,
      });
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    var options: string[] = [];
    const observes = await this.observeManager.getObserves({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });
    const currentName = interaction.options.getString('current-name');
    const focusedOption = interaction.options.getFocused(true);

    var observe;
    if (currentName != null) {
      observe = observes.find((observe) => observe.name == currentName);
    }

    switch (focusedOption.name) {
      case 'current-name': {
        options = observes.map((observe) => observe.name);
        break;
      }
      case 'name': {
        if (!!observe) {
          options = [observe.name];
        }

        break;
      }
      case 'url': {
        if (!!observe) {
          options = [observe.url];
        }

        break;
      }
      case 'css-selector': {
        if (!!observe && observe.cssSelector != null) {
          options = [observe.cssSelector];
        }

        break;
      }
      case 'text': {
        if (!!observe) {
          options = [observe.watchText];
        }

        break;
      }
    }

    await interaction.respond(
      options.map((option) => ({ name: option, value: option }))
    );
  }
}
