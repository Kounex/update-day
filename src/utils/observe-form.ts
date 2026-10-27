import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  LabelBuilder,
  MessageActionRowComponentBuilder,
  ModalBuilder,
  RadioGroupBuilder,
  RadioGroupOptionBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { Draft, DraftInput } from '../managers/drafts.js';
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
import { buildCommandResultEmbed, buildScrapeReport, MessagePayload } from './build-embed.js';

// The form (modal) for creating and editing Observes, and the preview step
// after it. A modal holds at most 5 fields, so it asks for what defines the
// target; interval, notification and keep-active are picked on the preview,
// next to the screenshot of what the bot saw.

export const MODAL_PREFIX = 'obsform:';
export const DRAFT_PREFIX = 'obsdraft:';
export const DRAFT_INTERVAL = `${DRAFT_PREFIX}interval:`;
export const DRAFT_NOTIFY = `${DRAFT_PREFIX}notify:`;
export const DRAFT_KEEP = `${DRAFT_PREFIX}keep:`;
export const DRAFT_FORM = `${DRAFT_PREFIX}form:`;
export const DRAFT_SAVE = `${DRAFT_PREFIX}save:`;
export const DRAFT_CANCEL = `${DRAFT_PREFIX}cancel:`;

const FIELD_NAME = 'name';
const FIELD_URL = 'url';
const FIELD_TEXT = 'text';
const FIELD_MODE = 'mode';
const FIELD_SELECTOR = 'selector';

const modeDescription: Record<WatchMode, string> = {
  [WatchMode.Disappears]: 'e.g. "Sold out" goes away',
  [WatchMode.Appears]: 'e.g. "In stock" shows up',
  [WatchMode.Changes]: 'the text inside the CSS selector changes',
};

const textInput = (
  id: string,
  options: { value: string; maxLength: number; required: boolean; placeholder: string }
) => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(options.maxLength)
    .setRequired(options.required)
    .setPlaceholder(options.placeholder);
  // An empty prefill is rejected by Discord.
  if (options.value) {
    input.setValue(options.value.slice(0, options.maxLength));
  }

  return input;
};

export const buildObserveModal = (draft: Draft): ModalBuilder => {
  const { input } = draft;
  return new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}${draft.id}`)
    .setTitle(draft.editingId === undefined ? 'New Observe' : 'Edit Observe')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Name')
        .setDescription('So you can recognize and manage it later')
        .setTextInputComponent(
          textInput(FIELD_NAME, {
            value: input.name,
            maxLength: MAX_NAME_LENGTH,
            required: true,
            placeholder: 'Hoodie restock',
          })
        ),
      new LabelBuilder()
        .setLabel('Page')
        .setTextInputComponent(
          textInput(FIELD_URL, {
            value: input.url,
            maxLength: MAX_URL_LENGTH,
            required: true,
            placeholder: 'https://shop.example.com/products/thing',
          })
        ),
      new LabelBuilder()
        .setLabel('Text to watch')
        .setDescription('As shown on the page - case and spacing don\'t matter')
        .setTextInputComponent(
          textInput(FIELD_TEXT, {
            value: input.watchText,
            maxLength: MAX_WATCH_TEXT_LENGTH,
            required: false,
            placeholder: 'Sold out',
          })
        ),
      new LabelBuilder()
        .setLabel('Notify me when')
        .setRadioGroupComponent(
          new RadioGroupBuilder()
            .setCustomId(FIELD_MODE)
            .setRequired(true)
            .setOptions(
              Object.values(WatchMode).map((mode) =>
                new RadioGroupOptionBuilder()
                  .setLabel(watchModeText(mode))
                  .setValue(mode)
                  .setDescription(modeDescription[mode])
                  .setDefault(mode === input.watchMode)
              )
            )
        ),
      new LabelBuilder()
        .setLabel('CSS selector (optional)')
        .setDescription('Only look in this part of the page - needed for "Content changes"')
        .setTextInputComponent(
          textInput(FIELD_SELECTOR, {
            value: input.cssSelector ?? '',
            maxLength: MAX_SELECTOR_LENGTH,
            required: false,
            placeholder: '#product .stock',
          })
        )
    );
};

// The subset of ModalSubmitFields this needs - keeps it testable.
export interface ModalFields {
  getTextInputValue(customId: string): string;
  getRadioGroup(customId: string, required?: boolean): string | null;
}

// Reads a submitted form into the draft's input; the rest stays as it was.
export const readObserveModal = (
  fields: ModalFields,
  current: DraftInput
): DraftInput => {
  const mode = fields.getRadioGroup(FIELD_MODE);
  const selector = fields.getTextInputValue(FIELD_SELECTOR).trim();
  return {
    ...current,
    name: fields.getTextInputValue(FIELD_NAME).trim(),
    url: fields.getTextInputValue(FIELD_URL).trim(),
    watchText: fields.getTextInputValue(FIELD_TEXT).trim(),
    watchMode: Object.values(WatchMode).includes(mode as WatchMode)
      ? (mode as WatchMode)
      : current.watchMode,
    cssSelector: selector.length > 0 ? selector : null,
  };
};

const settingRows = (
  draft: Draft
): Array<ActionRowBuilder<MessageActionRowComponentBuilder>> => {
  const { input } = draft;
  const interval = new StringSelectMenuBuilder()
    .setCustomId(`${DRAFT_INTERVAL}${draft.id}`)
    .setPlaceholder('How often to check')
    .addOptions(
      ScrapeInterval.enumValues.map((type) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`Check ${ScrapeInterval.enumText(type).toLocaleLowerCase()}`)
          .setValue(type)
          .setDefault(type === input.scrapeInterval)
      )
    );
  const notify = new StringSelectMenuBuilder()
    .setCustomId(`${DRAFT_NOTIFY}${draft.id}`)
    .setPlaceholder('Where to notify you')
    .addOptions(
      Object.values(NotifyMode).map((mode) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`Notify via ${notifyModeText(mode).toLocaleLowerCase()}`)
          .setValue(mode)
          .setDefault(mode === input.notifyMode)
      )
    );
  const buttons = new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${DRAFT_SAVE}${draft.id}`)
      .setLabel(draft.editingId === undefined ? 'Start watching' : 'Save changes')
      .setStyle(ButtonStyle.Success)
      .setDisabled(!draft.valid),
    new ButtonBuilder()
      .setCustomId(`${DRAFT_KEEP}${draft.id}`)
      .setLabel(input.keepActive ? 'Keep active: on' : 'Keep active: off')
      .setStyle(input.keepActive ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${DRAFT_FORM}${draft.id}`)
      .setLabel('Edit form')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${DRAFT_CANCEL}${draft.id}`)
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary)
  );

  return [
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(interval),
    new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(notify),
    buttons,
  ];
};

// The preview step: what the bot saw, whether it works, and the settings.
export const buildDraftMessage = (draft: Draft): MessagePayload => {
  const keepActiveNote = draft.input.keepActive
    ? 'After a change it keeps watching for the next one.'
    : 'After a change it goes inactive until you press **Keep watching**.';

  let body: MessagePayload;
  if (draft.scrapeResult) {
    body = buildScrapeReport(
      { ...draft.input, cssSelector: draft.input.cssSelector },
      draft.scrapeResult,
      draft.valid
        ? {
            title: draft.editingId === undefined ? '✅ Ready to watch' : '✅ Ready to save',
            text: `This is what the bot sees right now. Pick how often to check and where to notify you. ${keepActiveNote}`,
            color: 'DarkGreen',
          }
        : {
            title: '⚠️ This would not work yet',
            text: `${draft.message ?? 'Something is off.'}\n\nPress **Edit form** to fix it.`,
            color: 'Orange',
          }
    );
  } else {
    body = {
      embeds: [
        buildCommandResultEmbed({
          successful: false,
          message: `${draft.message ?? 'Something is off.'}\n\nPress **Edit form** to fix it.`,
        }),
      ],
    };
  }

  return {
    content: `**${draft.input.name || 'New Observe'}**`,
    ...body,
    files: body.files ?? [],
    components: settingRows(draft),
  };
};
