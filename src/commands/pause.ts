import { SlashCommandBuilder } from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import {
  actionRow,
  BUTTON_PAUSE,
  buildCommandResultEmbed,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import { ownedObserveFromButton } from '../utils/owned-observe.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Stop checking one of your Observes for now (/reactivate resumes it)')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to pause')
        .setAutocomplete(true)
        .setRequired(true)
    );

  public readonly handledButtonIds = [BUTTON_PAUSE] as const;

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;
    const observe = await this.observeManager.findByName(
      interaction.guildId!,
      interaction.user.id,
      name
    );

    await interaction.reply({
      embeds: [
        buildCommandResultEmbed(
          observe
            ? await this.observeManager.setActive(observe, false)
            : {
                successful: false,
                message: `You don't have an Observe called \`${name}\` - check \`/list\`.`,
              }
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
  }

  public async handleButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<void> {
    const observe = await ownedObserveFromButton(
      interaction,
      BUTTON_PAUSE,
      this.observeManager
    );
    if (!observe) {
      return;
    }

    const result = await this.observeManager.setActive(observe, false);
    await interaction.update({
      components: [actionRow({ id: observe.id, url: observe.url, active: false })],
    });
    await interaction.followUp({
      embeds: [buildCommandResultEmbed(result)],
      flags: MessageFlags.Ephemeral,
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager, {
      filter: (observe) => observe.active,
    });
  }
}
