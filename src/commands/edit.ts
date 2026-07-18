import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
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
    .setName('edit')
    .setDescription('Edit one of your existing Observes')
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
        .setName('text')
        .setDescription(
          'Text currently on the page (e.g. "coming soon") - you will be notified once it is no longer found'
        )
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('scrape-interval')
        .setDescription(
          'Set the interval the bot should scrape your Observe, Hourly is the default'
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
        .setName('css-selector')
        .setDescription(
          'Narrows the search area, useful if the text could also appear elsewhere on the page'
        )
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('keep-active')
        .setDescription(
          'If you want to keep the Observe active once it found a change, false by default'
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

    const observe = Observe.create(
      interaction.guildId!,
      interaction.user.id,
      Date.now(),
      Date.now(),
      interaction.options.getString('name')!,
      interaction.options.getString('url')!,
      interaction.options.getString('css-selector'),
      interaction.options.getString('text')!,
      interaction.options.getString('scrape-interval'),
      interaction.options.getBoolean('keep-active') ?? false
    );

    if (observe instanceof Observe) {
      const commandResult = await this.observeManager.editObserve(
        currentName,
        observe
      );

      if (commandResult.successful) {
        await interaction.reply({
          embeds: [buildObserveEmbed(observe)],
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          embeds: [buildCommandResultEmbed(commandResult)],
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
