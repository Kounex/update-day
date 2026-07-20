import { SlashCommandBuilder } from '@discordjs/builders';
import {
  ActionRowBuilder,
  AutocompleteInteraction,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import ObserveManager from '../managers/observe.js';
import { TYPES } from '../types.js';
import { buildCommandResultEmbed } from '../utils/build-embed.js';
import respondWithObserveNames from '../utils/observe-name-autocomplete.js';
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

  public readonly handledButtonIds = [CONFIRM_PREFIX, CANCEL_PREFIX] as const;

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async execute(
    interaction: ChatInputCommandInteraction
  ): Promise<void> {
    const name = interaction.options.getString('name')!;

    const observes = await this.observeManager.getObserves({
      guildId: interaction.guildId!,
      userId: interaction.user.id,
    });

    if (!observes.some((observe) => observe.name == name)) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message: `Did not find an Observe to delete with the name \`${name}\`. Make sure it exists with \`/list\`.`,
          }),
        ],
        ephemeral: true,
      });
      return;
    }

    // Deleting is unrecoverable, so make sure it's intentional before it
    // happens instead of a single command invocation nuking it outright.
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${CONFIRM_PREFIX}${interaction.user.id}:${name}`)
        .setLabel('Delete')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${CANCEL_PREFIX}${interaction.user.id}:${name}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: `Are you sure you want to delete your Observe \`${name}\`? This can't be undone.`,
      components: [row],
      ephemeral: true,
    });
  }

  public async handleButtonInteraction(
    interaction: ButtonInteraction
  ): Promise<void> {
    const isCancel = interaction.customId.startsWith(CANCEL_PREFIX);
    const rest = interaction.customId.slice(
      isCancel ? CANCEL_PREFIX.length : CONFIRM_PREFIX.length
    );
    const separatorIndex = rest.indexOf(':');
    const userId = rest.slice(0, separatorIndex);
    const name = rest.slice(separatorIndex + 1);

    // Ephemeral messages are only ever visible to the user who triggered
    // them, so in practice only they could ever click this - kept as a
    // cheap, explicit safety net rather than a load-bearing check.
    if (interaction.user.id !== userId) {
      await interaction.reply({
        content: "This isn't your confirmation to respond to!",
        ephemeral: true,
      });
      return;
    }

    if (isCancel) {
      await interaction.update({
        content: `Cancelled - your Observe \`${name}\` was not deleted.`,
        components: [],
      });
      return;
    }

    const commandResult = await this.observeManager.deleteObserve(
      interaction.guildId!,
      interaction.user.id,
      name
    );

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
}
