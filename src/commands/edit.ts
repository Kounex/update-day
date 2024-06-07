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
    .addStringOption((option) =>
      option
        .setName('keep-active')
        .setDescription(
          'If you want to deactivate the observe once it found a change, on by default'
        )
        .setChoices([
          { name: 'Yes', value: 'true' },
          { name: 'No', value: 'false' },
        ])
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
      interaction.user.id,
      Date.now(),
      Date.now(),
      interaction.options.getString('name')!,
      interaction.options.getString('url')!,
      interaction.options.getString('css-selector')!,
      interaction.options.getString('current-text')!,
      interaction.options.getString('scrape-interval'),
      interaction.options.getString('dom-element-property'),
      interaction.options.getString('keep-active') != null
        ? Boolean(interaction.options.getString('keep-active'))
        : false
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
      case 'keep-active': {
        if (!!observe) {
          options =
            observe!.keepActive != null
              ? [observe.keepActive! ? 'Yes' : 'No']
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
