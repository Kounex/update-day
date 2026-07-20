import {
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
} from '@discordjs/builders';
import {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from 'discord.js';

export default interface Command {
  readonly slashCommand:
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  // Matched as *prefixes* of an incoming button's customId (see bot.ts), not
  // exact IDs - a button that needs to carry per-interaction data (e.g.
  // which Observe it's about) sets its customId to `${prefix}${data}`.
  readonly handledButtonIds?: readonly string[];
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
  handleButtonInteraction?: (interaction: ButtonInteraction) => Promise<void>;
  handleAutocompleteInteraction?: (
    interaction: AutocompleteInteraction
  ) => Promise<void>;
}
