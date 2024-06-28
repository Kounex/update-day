import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { buildCommandResultEmbed } from '../utils/build-embed.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('reactivate')
    .setDescription('Reactivate on of your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to reactivate')
        .setAutocomplete(true)
        .setRequired(true)
    );

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;

    const commandResult = await this.observeManager.reactivateObserve(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    await interaction.reply({
      embeds: [buildCommandResultEmbed(commandResult)],
      ephemeral: true,
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    var observes = (
      await this.observeManager.getObserves({
        guildId: interaction.guildId!,
        userId: interaction.user.id,
      })
    ).filter((observe) => !observe.active);

    const userText = interaction.options.getFocused();

    if (userText.trim().length > 0) {
      observes = observes.filter((observe) =>
        observe.name
          .toLocaleLowerCase()
          .trim()
          .includes(userText.toLocaleLowerCase().trim())
      );
    }

    await interaction.respond(
      observes.map((observe) => ({ name: observe.name, value: observe.name }))
    );
  }
}
