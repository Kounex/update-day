import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { Observe } from '../types/models/observe.js';
import {
  BUTTON_DELETE,
  buildCommandResultEmbed,
} from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
import { ownedObserveFromButton } from '../utils/owned-observe.js';
import Command from './command.js';

const CONFIRM_PREFIX = 'delete-confirm:';
const CANCEL_PREFIX = 'delete-cancel:';

@injectable()
export default class implements Command {
  public readonly slashCommand = new SlashCommandBuilder()
    .setName('delete')
    .setDescription('Delete one of your Observes')
    .addStringOption((option) =>
      option
        .setName('name')
        .setDescription('Name of your Observe to delete')
        .setAutocomplete(true)
        .setRequired(true)
    );

  // BUTTON_DELETE is the "Delete…" button on notifications and listings - it
  // leads to the same confirmation as the command.
  public readonly handledComponentIds = [
    CONFIRM_PREFIX,
    CANCEL_PREFIX,
    BUTTON_DELETE,
  ] as const;

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

    if (!observe) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `You don't have an Observe called \`${name}\` - check \`/list\`.`,
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply(this.confirmation(observe));
  }

  public async handleButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<void> {
    const prefix = [CONFIRM_PREFIX, CANCEL_PREFIX, BUTTON_DELETE].find(
      (candidate) => interaction.customId.startsWith(candidate)
    )!;
    const observe = await ownedObserveFromButton(
      interaction,
      prefix,
      this.observeManager
    );
    if (!observe) {
      return;
    }

    if (prefix === BUTTON_DELETE) {
      // Deleting is unrecoverable, so even the button asks first.
      await interaction.reply(this.confirmation(observe));
      return;
    }

    if (prefix === CANCEL_PREFIX) {
      await interaction.update({
        content: `Cancelled - your Observe \`${observe.name}\` was not deleted.`,
        components: [],
      });
      return;
    }

    const commandResult = await this.observeManager.deleteObserve(observe);
    await interaction.update({
      content: '',
      embeds: [buildCommandResultEmbed(commandResult)],
      components: [],
    });
  }

  public async handleAutocompleteInteraction(
    interaction: AutocompleteInteraction
  ): Promise<void> {
    await respondWithObserveNames(interaction, this.observeManager);
  }

  private confirmation(observe: Observe) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CONFIRM_PREFIX}${observe.id}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CANCEL_PREFIX}${observe.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    return {
      content: `Are you sure you want to delete your Observe \`${observe.name}\`? This can't be undone.`,
      components: [row],
      flags: MessageFlags.Ephemeral as const,
    };
  }
}
