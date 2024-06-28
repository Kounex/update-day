import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import {
  buildCommandResultEmbed,
  buildObserveEmbed,
  buildObserveListEmbed,
} from '../utils/build-embed.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('list')
    .setDescription('List your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription(
          'If you only want to see a specific Observe, will show all by default'
        )
        .setAutocomplete(true)
    )
    .addBooleanOption((option) =>
      option
        .setName('active-only')
        .setDescription(
          'If you only want to see your active Observes, true by default'
        )
    )
    .addBooleanOption((option) =>
      option
        .setName('compact')
        .setDescription(
          'If you want to see your Observes in a compact list, true by default'
        )
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name');
    const activeOnly = interaction.options.getBoolean('active-only') ?? true;
    const compact = interaction.options.getBoolean('compact') ?? true;

    const observes = await this.observeManager.getObserves({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });

    if (name == null) {
      await interaction.reply({
        embeds: [buildObserveListEmbed(observes, activeOnly, compact)],
        ephemeral: true,
      });
    } else {
      const observe = observes.find((observe) => observe.name == name);

      if (!!observe) {
        await interaction.reply({
          embeds: [buildObserveEmbed(observe, { color: 'DarkBlue' })],
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          embeds: [
            buildCommandResultEmbed({
              successful: false,
              message: `You don't have an Observe with the name \`${name}\`! Make use of autocomplete to choose an existing Observe or take a look at all your Observes by using this command without providing a name.`,
            }),
          ],
          ephemeral: true,
        });
      }
    }
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name');
    const focusedOption = interaction.options.getFocused(true);
    var observes = await this.observeManager.getObserves({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });

    switch (focusedOption.name) {
      case 'name': {
        if (name != null && name.trim().length > 0) {
          observes = observes.filter((observe) =>
            observe.name
              .toLocaleLowerCase()
              .trim()
              .includes(name.toLocaleLowerCase().trim())
          );
        }
        break;
      }
    }

    await interaction.respond(
      observes.map((observe) => ({ name: observe.name, value: observe.name }))
    );
  }
}
