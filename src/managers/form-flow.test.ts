// The form flow end to end - open, submit, pick settings, save; and edit -
// with fake Discord interactions against a real (temporary) SQLite database.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
 after, before, describe, it,
} from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'update-day-form-'));
process.env.DATABASE_URL = `file:${join(dir, 'db.sqlite')}`;
process.env.DISCORD_TOKEN ??= 'test';
execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env: process.env, stdio: 'ignore' });

const { prisma } = await import('../utils/db.js');
const { default: ObserveManager } = await import('./observe.js');
const { default: FormFlow } = await import('./form-flow.js');
const { default: DraftStore, emptyDraftInput } = await import('./drafts.js');
const { default: SettingsService } = await import('../services/settings.js');
const { WatchMode, NotifyMode } = await import('../types/models/observe.js');
const form = await import('../utils/observe-form.js');
type ScrapeResult = import('../types/classes/scrape-result.js').ScrapeResult;

const page = (matchFound: boolean): ScrapeResult => ({
  ok: true,
  text: matchFound ? 'Sold out' : 'In stock',
  matchFound,
  thumbnail: null,
  httpStatus: 200,
  durationMS: 5,
  finalUrl: 'https://shop.test/item',
  title: 'Shop',
});

let nextPage = page(true);
let scrapes = 0;
const scraper = {
  async scrape() {
    scrapes++;
    return nextPage;
  },
};
const notifier = { notify: async () => true };
const manager = new ObserveManager(scraper as never, new SettingsService(), notifier);
const drafts = new DraftStore();
const flow = new FormFlow(drafts, manager);

// Records what the flow answers with.
const fake = (customId = '', extra: Record<string, unknown> = {}) => {
  const calls: Array<[string, any]> = [];
  const record = (name: string) => async (payload?: unknown) => {
    calls.push([name, payload]);
  };

  return {
    calls,
    last: (name: string) => calls.filter(([call]) => call === name).at(-1)?.[1],
    called: (name: string) => calls.some(([call]) => call === name),
    interaction: {
      customId,
      user: { id: 'user' },
      guildId: 'guild',
      channelId: 'channel',
      values: [] as string[],
      inGuild: () => true,
      isFromMessage: () => false,
      appPermissions: { has: () => true },
      showModal: record('showModal'),
      reply: record('reply'),
      update: record('update'),
      deferReply: record('deferReply'),
      deferUpdate: record('deferUpdate'),
      editReply: record('editReply'),
      ...extra,
    } as any,
  };
};

// `fromMessage`: the components of the message the form was opened from.
const submit = (draftId: string, values: Record<string, string>, mode: string, fromMessage?: Array<{ components: Array<{ customId: string }> }>) =>
  fake(`${form.MODAL_PREFIX}${draftId}`, {
    isFromMessage: () => fromMessage !== undefined,
    message: fromMessage === undefined ? undefined : { components: fromMessage },
    fields: {
      getTextInputValue: (id: string) => values[id] ?? '',
      getRadioGroup: () => mode,
    },
  });

const openedDraftId = (opened: ReturnType<typeof fake>) =>
  (opened.last('showModal').toJSON().custom_id as string).slice(form.MODAL_PREFIX.length);

const buttonIds = (payload: any): string[] =>
  payload.components.flatMap((row: any) => row.toJSON().components.map((component: any) => component.custom_id));

describe('form flow', () => {
  before(async () => {
    await prisma.$connect();
  });

  after(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates an Observe: form, preview, settings, save - loading the page once', async () => {
    const opened = fake();
    await flow.openNew(opened.interaction, emptyDraftInput());
    const draftId = openedDraftId(opened);

    scrapes = 0;
    nextPage = page(true);
    const submitted = submit(draftId, { name: 'Hoodie', url: 'https://shop.test/item', text: 'sold out' }, WatchMode.Disappears);
    await flow.handleModalSubmit(submitted.interaction);
    assert.ok(submitted.called('deferReply'));
    const preview = submitted.last('editReply');
    assert.match(preview.embeds[0].toJSON().title, /Ready to watch/);
    assert.ok(buttonIds(preview).includes(`${form.DRAFT_SAVE}${draftId}`));

    const interval = fake(`${form.DRAFT_INTERVAL}${draftId}`, { values: ['FiveMinutes'] });
    await flow.handleSelect(interval.interaction);
    const notify = fake(`${form.DRAFT_NOTIFY}${draftId}`, { values: [NotifyMode.Both] });
    await flow.handleSelect(notify.interaction);
    await flow.handleButton(fake(`${form.DRAFT_KEEP}${draftId}`).interaction);

    const save = fake(`${form.DRAFT_SAVE}${draftId}`);
    await flow.handleButton(save.interaction);
    assert.match(save.last('editReply').content, /Now watching/);
    assert.equal(scrapes, 1, 'the preview was reused for saving');

    const saved = (await manager.findByName('guild', 'user', 'Hoodie'))!;
    assert.equal(saved.scrapeInterval.durationMS, 5 * 60 * 1000);
    assert.equal(saved.notifyMode, NotifyMode.Both);
    assert.equal(saved.keepActive, true);
    assert.equal(saved.channelId, 'channel');
    assert.equal(saved.lastState, 'present');

    // The draft is gone once saved.
    const again = fake(`${form.DRAFT_SAVE}${draftId}`);
    await flow.handleButton(again.interaction);
    assert.match(again.last('reply').embeds[0].toJSON().description, /expired/);
  });

  it('keeps Start watching disabled while the page does not fit, and lets the form fix it', async () => {
    const opened = fake();
    await flow.openNew(opened.interaction, emptyDraftInput());
    const draftId = openedDraftId(opened);

    nextPage = page(false);
    const submitted = submit(draftId, { name: 'Typo', url: 'https://shop.test/item', text: 'sold ot' }, WatchMode.Disappears);
    await flow.handleModalSubmit(submitted.interaction);
    const preview = submitted.last('editReply');
    assert.match(preview.embeds[0].toJSON().title, /would not work/);
    const saveButton = preview.components.at(-1).toJSON().components[0];
    assert.equal(saveButton.disabled, true);

    const save = fake(`${form.DRAFT_SAVE}${draftId}`);
    await flow.handleButton(save.interaction);
    assert.ok(save.last('reply'), 'refused');
    assert.equal(await manager.findByName('guild', 'user', 'Typo'), undefined);

    // Edit form → fixed submit from the same message updates it in place.
    const reopen = fake(`${form.DRAFT_FORM}${draftId}`);
    await flow.handleButton(reopen.interaction);
    assert.equal(reopen.last('showModal').toJSON().components[0].component.value, 'Typo');

    nextPage = page(true);
    const fixed = submit(draftId, { name: 'Typo', url: 'https://shop.test/item', text: 'sold out' }, WatchMode.Disappears, [
      { components: [{ customId: `${form.DRAFT_INTERVAL}${draftId}` }] },
    ]);
    await flow.handleModalSubmit(fixed.interaction);
    assert.ok(fixed.called('deferUpdate'));
    assert.ok(!fixed.called('deferReply'));
    assert.match(fixed.last('editReply').embeds[0].toJSON().title, /Ready to watch/);
  });

  it('refuses a name that is already taken', async () => {
    const opened = fake();
    await flow.openNew(opened.interaction, emptyDraftInput());
    const submitted = submit(openedDraftId(opened), { name: 'Hoodie', url: 'https://shop.test/other', text: 'x' }, WatchMode.Disappears);
    await flow.handleModalSubmit(submitted.interaction);
    assert.match(submitted.last('editReply').embeds[0].toJSON().description, /already have/);
  });

  it('edits an Observe through the form, even while its text is gone', async () => {
    const observe = (await manager.findByName('guild', 'user', 'Hoodie'))!;
    const opened = fake();
    await flow.openEdit(opened.interaction, observe);
    const modal = opened.last('showModal').toJSON();
    assert.equal(modal.title, 'Edit Observe');
    const draftId = openedDraftId(opened);

    // Only the name changes; the page has meanwhile changed (text gone).
    nextPage = page(false);
    const submitted = submit(draftId, { name: 'Hoodie EU', url: observe.url, text: observe.watchText }, observe.watchMode);
    await flow.handleModalSubmit(submitted.interaction);
    assert.match(submitted.last('editReply').embeds[0].toJSON().title, /Ready to save/);

    const save = fake(`${form.DRAFT_SAVE}${draftId}`);
    await flow.handleButton(save.interaction);
    assert.match(save.last('editReply').content, /saved/);
    const edited = (await manager.getObserve(observe.id))!;
    assert.equal(edited.name, 'Hoodie EU');
    assert.equal(edited.lastState, observe.lastState, 'state untouched by a non-target edit');
    assert.equal(edited.keepActive, true, 'settings not in the form are kept');
  });

  it('answers a form opened from a notification with its own reply, leaving the notification alone', async () => {
    const observe = (await manager.findByName('guild', 'user', 'Hoodie EU'))!;
    const opened = fake();
    await flow.openEdit(opened.interaction, observe);
    nextPage = page(false);
    const submitted = submit(
      openedDraftId(opened),
      { name: observe.name, url: observe.url, text: observe.watchText },
      observe.watchMode,
      [{ components: [{ customId: `obs:pause:${observe.id}` }, { customId: `obs:edit:${observe.id}` }] }]
    );
    await flow.handleModalSubmit(submitted.interaction);
    assert.ok(submitted.called('deferReply'));
    assert.ok(!submitted.called('deferUpdate'));
  });

  it('cancels without saving', async () => {
    const opened = fake();
    await flow.openNew(opened.interaction, { ...emptyDraftInput(), name: 'Never' });
    const draftId = openedDraftId(opened);
    const cancel = fake(`${form.DRAFT_CANCEL}${draftId}`);
    await flow.handleButton(cancel.interaction);
    assert.match(cancel.last('update').content, /Cancelled/);
    assert.equal(await manager.findByName('guild', 'user', 'Never'), undefined);
  });

  it('doesn\'t let someone else use a draft', async () => {
    const opened = fake();
    await flow.openNew(opened.interaction, emptyDraftInput());
    const intruder = fake(`${form.DRAFT_SAVE}${openedDraftId(opened)}`, { user: { id: 'intruder' } });
    await flow.handleButton(intruder.interaction);
    assert.match(intruder.last('reply').embeds[0].toJSON().description, /expired/);
  });
});
