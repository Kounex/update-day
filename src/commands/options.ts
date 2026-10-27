import {
  SlashCommandBooleanOption,
  SlashCommandStringOption,
} from '@discordjs/builders';
import {
  MAX_NAME_LENGTH,
  MAX_SELECTOR_LENGTH,
  MAX_URL_LENGTH,
  MAX_WATCH_TEXT_LENGTH,
  NotifyMode,
  notifyModeText,
  ScrapeInterval,
  WatchMode,
  watchModeText,
} from '../types/models/observe.js';

// Option definitions shared by /observe, /edit and /preview, so they read
// and validate the same everywhere.
export const nameOption = (option: SlashCommandStringOption) =>
  option.setMaxLength(MAX_NAME_LENGTH);

export const urlOption = (option: SlashCommandStringOption) =>
  option.setMaxLength(MAX_URL_LENGTH);

export const textOption = (option: SlashCommandStringOption) =>
  option.setMaxLength(MAX_WATCH_TEXT_LENGTH);

export const selectorOption = (option: SlashCommandStringOption) =>
  option.setMaxLength(MAX_SELECTOR_LENGTH);

export const modeOption = (option: SlashCommandStringOption) =>
  option
    .setName('mode')
    .setChoices(
      Object.values(WatchMode).map((mode) => ({
        name: watchModeText(mode),
        value: mode,
      }))
    );

export const notifyOption = (option: SlashCommandStringOption) =>
  option
    .setName('notify')
    .setChoices(
      Object.values(NotifyMode).map((mode) => ({
        name: notifyModeText(mode),
        value: mode,
      }))
    );

export const intervalOption = (option: SlashCommandStringOption) =>
  option.setName('scrape-interval').setChoices(
    ScrapeInterval.enumValues.map((type) => ({
      name: ScrapeInterval.enumText(type),
      value: type,
    }))
  );

export const keepActiveOption = (option: SlashCommandBooleanOption) =>
  option.setName('keep-active');
