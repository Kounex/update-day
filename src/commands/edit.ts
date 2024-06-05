import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe';
import { TYPES } from '../types';
import { Observe, ScrapeIntervalType } from '../types/models/observe';
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
        .setName('scrape-interval')
        .setDescription(
          'Set the interval the bot should scrape your observe | Hourly is the default'
        )
        .setChoices(
          Object.keys(ScrapeIntervalType)
            .filter((item) => {
              return isNaN(Number(item));
            })
            .map((type) => {
              return { name: type, value: type };
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
    );

  constructor(
    @inject(TYPES.Managers.Scrape)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const currentName = interaction.options.getString('current-name')!;

    const observe = Observe.create(
      interaction.user.id,
      Date.now(),
      Date.now(),
      interaction.options.getString('name')!,
      interaction.options.getString('url')!,
      interaction.options.getString('css-selector')!,
      interaction.options.getString('current-text')!,
      interaction.options.getString('scrape-interval'),
      interaction.options.getString('dom-element-property')
    );

    if (observe instanceof Observe) {
      const commandResult = await this.observeManager.editObserve(
        currentName,
        observe
      );

      await interaction.reply({
        embeds: [buildCommandResultEmbed(commandResult)],
        ephemeral: true,
      });
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
    const observes = await this.observeManager.getObserves(interaction.user.id);
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
        if (!!observe) {
          options = [observe.cssSelector];
        }

        break;
      }
      case 'current-text': {
        if (!!observe) {
          options = [observe.currentText];
        }

        break;
      }
      case 'dom-element-property': {
        if (!!observe) {
          options =
            observe!.domElementProperty != null
              ? [observe.domElementProperty!]
              : [];
        }

        break;
      }
    }

    await interaction.respond(
      options.map((option) => ({ name: option, value: option }))
    );
  }
}
