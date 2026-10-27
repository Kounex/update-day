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
  BUTTON_KEEP_WATCHING,
  buildCommandResultEmbed,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import { ownedObserveFromButton } from '../utils/owned-observe.js';
import Command from './command.js';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('reactivate')
    .setDescription('Resume one of your inactive or paused Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to reactivate')
        .setAutocomplete(true)
        .setRequired(true)
    );

  public readonly handledComponentIds = [BUTTON_KEEP_WATCHING] as const;

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
            ? await this.observeManager.setActive(observe, true)
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
      BUTTON_KEEP_WATCHING,
      this.observeManager
    );
    if (!observe) {
      return;
    }

    const result = await this.observeManager.setActive(observe, true);
    // Flip the button on the message that was clicked to "Pause".
    await interaction.update({
      components: [actionRow({ id: observe.id, url: observe.url, active: true })],
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
      filter: (observe) => !observe.active,
    });
  }
}
