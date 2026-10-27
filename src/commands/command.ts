import {
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
} from 'discord.js';

export default interface Command {
  readonly slashCommand:
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  // Matched as *prefixes* of an incoming button's or select menu's customId
  // (see bot.ts), not exact IDs - a component that needs to carry
  // per-interaction data (e.g. which Observe it's about) sets its customId to
  // `${prefix}${data}`.
  readonly handledComponentIds?: readonly string[];
  // Same, for submitted modals (forms).
  readonly handledModalIds?: readonly string[];
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
  handleSelectMenuInteraction?: (
    interaction: StringSelectMenuInteraction
  ) => Promise<void>;
  handleModalSubmitInteraction?: (
    interaction: ModalSubmitInteraction
  ) => Promise<void>;
  handleAutocompleteInteraction?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
}
