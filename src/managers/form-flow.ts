import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  MessageFlags,
  ModalSubmitInteraction,
  PermissionFlagsBits,
  StringSelectMenuInteraction,
} from 'discord.js';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types.js';
import {
  NotifyMode,
  Observe,
  ObserveInput,
  toNotifyMode,
} from '../types/models/observe.js';
import {
  actionRow,
  buildCommandResultEmbed,
  buildObserveEmbed,
} from '../utils/build-embed.js';
import {
  buildDraftMessage,
  buildObserveModal,
  DRAFT_CANCEL,
  DRAFT_FORM,
  DRAFT_INTERVAL,
  DRAFT_KEEP,
  DRAFT_NOTIFY,
  DRAFT_SAVE,
  MODAL_PREFIX,
  readObserveModal,
} from '../utils/observe-form.js';
import DraftStore, { Draft, DraftInput, draftInputOf } from './drafts.js';
import ObserveManager from './observe.js';

// A preview this recent is reused when saving instead of loading the page
// once more.
const REUSE_PREVIEW_MS = 5 * 60 * 1000;

type DraftInteraction =
  | ButtonInteraction
  | StringSelectMenuInteraction
  | ModalSubmitInteraction;

// The form flow: modal → preview with settings → save. Shared by /observe
// (new Observes, "New Observe" button) and /edit (Edit button).
@injectable()
export default class FormFlow {
  constructor(
    @inject(TYPES.Managers.Drafts) private readonly drafts: DraftStore,
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public async openNew(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    prefill: DraftInput
  ): Promise<void> {
    const draft = this.drafts.create(
      {
        userId: interaction.user.id,
        guildId: interaction.guildId!,
        channelId: interaction.channelId,
      },
      prefill
    );
    await interaction.showModal(buildObserveModal(draft));
  }

  public async openEdit(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    observe: Observe
  ): Promise<void> {
    const draft = this.drafts.create(
      {
        userId: interaction.user.id,
        guildId: observe.guildId,
        channelId: observe.channelId,
      },
      draftInputOf(observe),
      observe.id
    );
    await interaction.showModal(buildObserveModal(draft));
  }

  public async handleModalSubmit(
    interaction: ModalSubmitInteraction
  ): Promise<void> {
    const draft = await this.draftFor(interaction, MODAL_PREFIX);
    if (!draft) {
      return;
    }

    draft.input = readObserveModal(interaction.fields, draft.input);
    // Submitted from the preview's "Edit form": update that message in
    // place instead of piling up a new one.
    if (interaction.isFromMessage()) {
      await interaction.deferUpdate();
    } else {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    await this.refreshPreview(draft);
    await interaction.editReply({ ...buildDraftMessage(draft), attachments: [] });
  }

  public async handleSelect(
    interaction: StringSelectMenuInteraction
  ): Promise<void> {
    const prefix = interaction.customId.startsWith(DRAFT_INTERVAL)
      ? DRAFT_INTERVAL
      : DRAFT_NOTIFY;
    const draft = await this.draftFor(interaction, prefix);
    if (!draft) {
      return;
    }

    const [value] = interaction.values;
    if (prefix === DRAFT_INTERVAL) {
      draft.input.scrapeInterval = value;
    } else {
      draft.input.notifyMode = toNotifyMode(value);
    }

    await interaction.update({ components: buildDraftMessage(draft).components });
  }

  public async handleButton(interaction: ButtonInteraction): Promise<void> {
    const prefix = [DRAFT_KEEP, DRAFT_FORM, DRAFT_SAVE, DRAFT_CANCEL].find(
      (candidate) => interaction.customId.startsWith(candidate)
    );
    if (!prefix) {
      return;
    }

    const draft = await this.draftFor(interaction, prefix);
    if (!draft) {
      return;
    }

    switch (prefix) {
      case DRAFT_KEEP: {
        draft.input.keepActive = !draft.input.keepActive;
        await interaction.update(buildDraftMessage(draft));
        break;
      }

      case DRAFT_FORM: {
        await interaction.showModal(buildObserveModal(draft));
        break;
      }

      case DRAFT_CANCEL: {
        this.drafts.delete(draft.id);
        await interaction.update({
          content: 'Cancelled - nothing was saved.',
          embeds: [],
          components: [],
          attachments: [],
        });
        break;
      }

      default: {
        await this.save(interaction, draft);
      }
    }
  }

  private async save(
    interaction: ButtonInteraction,
    draft: Draft
  ): Promise<void> {
    if (!draft.valid) {
      await interaction.reply({
        content: 'Fix the Observe with **Edit form** first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (
      draft.editingId === undefined &&
      draft.input.notifyMode !== NotifyMode.DM &&
      interaction.inGuild() &&
      !interaction.appPermissions.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ])
    ) {
      await interaction.reply({
        content:
          'I can\'t post in this channel, so I couldn\'t notify you here. Pick **Notify via direct message**, or start over in a channel I can write in.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Saving may load the page once more.
    await interaction.deferUpdate();

    const scrapeResult =
      draft.scrapeResult &&
      draft.scrapedAtMS &&
      Date.now() - draft.scrapedAtMS < REUSE_PREVIEW_MS
        ? draft.scrapeResult
        : undefined;

    const result =
      draft.editingId === undefined
        ? await this.saveNew(draft, scrapeResult)
        : await this.saveEdit(draft, scrapeResult);

    if (!result.successful || !result.observe) {
      draft.valid = false;
      draft.message = result.message;
      draft.scrapeResult = result.scrapeResult ?? draft.scrapeResult;
      await interaction.editReply({ ...buildDraftMessage(draft), attachments: [] });
      return;
    }

    this.drafts.delete(draft.id);
    await interaction.editReply({
      content:
        draft.editingId === undefined
          ? `✅ Now watching \`${result.observe.name}\`.`
          : `✅ \`${result.observe.name}\` saved.`,
      embeds: [buildObserveEmbed(result.observe)],
      components: [actionRow(result.observe)],
      files: [],
      attachments: [],
    });
  }

  private async saveNew(draft: Draft, scrapeResult: Draft['scrapeResult']) {
    const observe = Observe.create(this.toInput(draft));
    if (!(observe instanceof Observe)) {
      return { successful: false, message: observe.message };
    }

    return this.observeManager.addObserve(observe, { scrapeResult });
  }

  private async saveEdit(draft: Draft, scrapeResult: Draft['scrapeResult']) {
    const current = await this.observeManager.getObserve(draft.editingId!);
    if (!current || current.userId !== draft.userId) {
      return {
        successful: false,
        message: 'This Observe doesn\'t exist anymore.',
      };
    }

    const { input } = draft;
    return this.observeManager.editObserve(
      current.guildId,
      current.userId,
      current.name,
      {
        name: input.name,
        url: input.url,
        cssSelector: input.cssSelector,
        watchText: input.watchText,
        watchMode: input.watchMode,
        notifyMode: input.notifyMode,
        scrapeInterval: input.scrapeInterval,
        keepActive: input.keepActive,
      },
      { scrapeResult }
    );
  }

  // Validate the draft and check its page - the preview the user decides on.
  private async refreshPreview(draft: Draft): Promise<void> {
    draft.scrapeResult = undefined;
    draft.scrapedAtMS = undefined;
    draft.message = undefined;

    const candidate = Observe.create(this.toInput(draft));
    if (!(candidate instanceof Observe)) {
      draft.valid = false;
      draft.message = candidate.message;
      return;
    }

    const sameName = await this.observeManager.findByName(
      draft.guildId,
      draft.userId,
      candidate.name
    );
    if (sameName && sameName.id !== draft.editingId) {
      draft.valid = false;
      draft.message = `You already have an Observe called \`${candidate.name}\` - pick another name.`;
      return;
    }

    const existing =
      draft.editingId === undefined
        ? undefined
        : await this.observeManager.getObserve(draft.editingId);

    draft.scrapeResult = await this.observeManager.preview(draft.guildId, {
      url: candidate.url,
      cssSelector: candidate.cssSelector,
      watchText: candidate.watchText,
      watchMode: candidate.watchMode,
    });
    draft.scrapedAtMS = Date.now();

    // Editing without touching what's watched (name, interval, ...) must
    // work whatever the page looks like right now - e.g. right after the
    // change it was waiting for.
    if (existing?.hasSameTarget(candidate)) {
      draft.valid = true;
      return;
    }

    const validation = this.observeManager.validate(candidate, draft.scrapeResult);
    draft.valid = validation.successful;
    draft.message = validation.message;
  }

  private toInput(draft: Draft): ObserveInput {
    return {
      guildId: draft.guildId,
      userId: draft.userId,
      channelId: draft.channelId,
      ...draft.input,
    };
  }

  private async draftFor(
    interaction: DraftInteraction,
    prefix: string
  ): Promise<Draft | undefined> {
    const draft = this.drafts.get(
      interaction.customId.slice(prefix.length),
      interaction.user.id
    );
    if (!draft) {
      await interaction.reply({
        embeds: [
          buildCommandResultEmbed({
            successful: false,
            message:
              'This form has expired (they last 15 minutes, and don\'t survive a bot restart). Start again with `/observe`.',
          }),
        ],
        flags: MessageFlags.Ephemeral,
      });
    }

    return draft;
  }
}
