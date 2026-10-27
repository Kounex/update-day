// ObserveManager against a real (temporary) SQLite database, with a fake
// scraper and notifier - covers the notification state machine end to end.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
 after, before, beforeEach, describe, it,
} from 'node:test';

const dir = mkdtempSync(join(tmpdir(), 'update-day-test-'));
process.env.DATABASE_URL = `file:${join(dir, 'db.sqlite')}`;
process.env.CONFIRM_DELAY_MS = '0';
process.env.DISCORD_TOKEN ??= 'test';

execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
  env: process.env,
  stdio: 'ignore',
});

const { prisma } = await import('../utils/db.js');
const { default: ObserveManager } = await import('./observe.js');
const { default: SettingsService } = await import('../services/settings.js');
const { Observe, WatchMode } = await import('../types/models/observe.js');
const { ScrapeFailure } = await import('../types/classes/scrape-result.js');
type ScrapeResult = import('../types/classes/scrape-result.js').ScrapeResult;
type MessagePayload = import('../utils/build-embed.js').MessagePayload;

const page = (matchFound: boolean | null, text = 'page text'): ScrapeResult => ({
  ok: true,
  text,
  matchFound,
  thumbnail: null,
  httpStatus: 200,
  durationMS: 5,
  finalUrl: 'https://shop.test/item',
  title: 'Shop',
});
const failure = (kind = ScrapeFailure.Timeout): ScrapeResult => ({
  ok: false,
  failure: kind,
  detail: 'boom',
  httpStatus: null,
  durationMS: 5,
  finalUrl: 'https://shop.test/item',
  title: '',
});

class FakeScraper {
  public queue: ScrapeResult[] = [];
  public calls = 0;
  async scrape(): Promise<ScrapeResult> {
    this.calls++;
    const next = this.queue.shift();
    assert.ok(next, 'unexpected scrape');
    return next;
  }
}

class FakeNotifier {
  public sent: MessagePayload[] = [];
  public deliver = true;
  async notify(_observe: unknown, payload: MessagePayload): Promise<boolean> {
    this.sent.push(payload);
    return this.deliver;
  }
}

const scraper = new FakeScraper();
const notifier = new FakeNotifier();
const settings = new SettingsService();
const manager = new ObserveManager(scraper as never, settings, notifier);

const create = async (
  overrides: Partial<Parameters<typeof Observe.create>[0]> = {},
  firstScrape: ScrapeResult = page(true)
) => {
  const observe = Observe.create({
    guildId: 'guild',
    userId: 'user',
    channelId: 'channel',
    name: `obs-${Math.random()}`,
    url: 'https://shop.test/item',
    watchText: 'sold out',
    ...overrides,
  });
  assert.ok(observe instanceof Observe);
  scraper.queue.push(firstScrape);
  const result = await manager.addObserve(observe);
  assert.equal(result.successful, true, result.message);
  return result.observe!;
};

const reload = async (id: number) => (await manager.getObserve(id))!;

describe('ObserveManager', () => {
  before(async () => {
    await prisma.$connect();
    await settings.updateSettings('guild', { userObserveLimit: 1000 });
  });

  after(async () => {
    await prisma.$disconnect();
    rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(() => {
    scraper.queue = [];
    scraper.calls = 0;
    notifier.sent = [];
    notifier.deliver = true;
  });

  it('validates and stores a baseline when creating', async () => {
    const observe = await create();
    assert.equal(observe.lastState, 'present');
    assert.ok(Number(observe.nextScrapeAtMS) > Date.now());
    assert.equal((await manager.getHistory(observe))[0].detail, 'created');
  });

  it('refuses a Disappears Observe whose text is not on the page', async () => {
    const observe = Observe.create({
      guildId: 'guild',
      userId: 'user',
      name: 'not-there',
      url: 'https://shop.test/item',
      watchText: 'sold out',
    });
    assert.ok(observe instanceof Observe);
    scraper.queue.push(page(false));
    const result = await manager.addObserve(observe);
    assert.equal(result.successful, false);
    assert.equal(await manager.findByName('guild', 'user', 'not-there'), undefined);
  });

  it('notifies once a change is confirmed, then goes inactive', async () => {
    const observe = await create();
    scraper.queue.push(page(false), page(false));
    const result = await manager.processObserve(observe);
    assert.equal(result.outcome, 'triggered');
    assert.equal(notifier.sent.length, 1);
    assert.equal(result.observe.active, false);
    assert.equal(result.observe.lastState, 'absent');
  });

  it('ignores a change the second load does not confirm', async () => {
    const observe = await create();
    scraper.queue.push(page(false), page(true));
    const result = await manager.processObserve(observe);
    assert.equal(result.outcome, 'unconfirmed');
    assert.equal(notifier.sent.length, 0);
    assert.equal(result.observe.active, true);
    assert.equal(result.observe.lastState, 'present');
  });

  it('keep-active notifies on transitions only and re-arms itself', async () => {
    let observe = await create({ keepActive: true });
    scraper.queue.push(page(false), page(false));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(notifier.sent.length, 1);
    assert.equal(observe.active, true);

    // Still gone: no second notification.
    scraper.queue.push(page(false));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(notifier.sent.length, 1);

    // Back: re-armed quietly.
    scraper.queue.push(page(true));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(observe.lastState, 'present');
    assert.equal(notifier.sent.length, 1);

    // Gone again: notifies again.
    scraper.queue.push(page(false), page(false));
    await manager.processObserve(observe);
    assert.equal(notifier.sent.length, 2);
  });

  it('retries a notification that could not be delivered', async () => {
    let observe = await create({ watchMode: WatchMode.Appears, watchText: 'in stock' }, page(false));
    notifier.deliver = false;
    scraper.queue.push(page(true), page(true));
    const first = await manager.processObserve(observe);
    assert.equal(first.outcome, 'undelivered');
    assert.equal(first.observe.active, true);
    assert.equal(first.observe.lastState, 'absent');
    assert.ok(Number(first.observe.nextScrapeAtMS) <= Date.now() + (15 * 60 * 1000));

    notifier.deliver = true;
    scraper.queue.push(page(true), page(true));
    observe = (await manager.processObserve(first.observe)).observe;
    assert.equal(notifier.sent.length, 2);
    assert.equal(observe.lastState, 'present');
    assert.equal(observe.active, false);
  });

  it('notifies about content changes with before and after', async () => {
    let observe = await create(
      { watchMode: WatchMode.Changes, watchText: '', cssSelector: '#price' },
      page(null, '10 €')
    );
    scraper.queue.push(page(null, '10 €'));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(notifier.sent.length, 0);

    scraper.queue.push(page(null, '8 €'), page(null, '8 €'));
    const result = await manager.processObserve(observe);
    assert.equal(result.outcome, 'triggered');
    const fields = notifier.sent[0].embeds[0].toJSON().fields ?? [];
    assert.ok(fields.some((field) => field.name === 'Before' && field.value.includes('10 €')));
    assert.ok(fields.some((field) => field.name === 'Now' && field.value.includes('8 €')));
  });

  it('counts a failed confirmation load as a failed check and retries soon', async () => {
    const observe = await create();
    scraper.queue.push(page(false), failure(ScrapeFailure.Blocked));
    const result = await manager.processObserve(observe);
    assert.equal(result.outcome, 'failed');
    assert.equal(notifier.sent.length, 0);
    assert.equal(result.observe.consecutiveTimeouts, 1);
    assert.equal(result.observe.lastState, 'present');
    assert.ok(Number(result.observe.nextScrapeAtMS) <= Date.now() + (5 * 60 * 1000));
  });

  it('a failed confirmation after a good first load starts a new failure streak', async () => {
    let observe = await create();
    scraper.queue.push(failure(), failure());
    observe = (await manager.processObserve(observe)).observe;
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(observe.consecutiveTimeouts, 2);

    scraper.queue.push(page(false), failure());
    const result = await manager.processObserve(observe);
    assert.equal(result.observe.consecutiveTimeouts, 1);
    assert.equal(result.observe.active, true, 'not deactivated by fail, fail, ok, fail');
    assert.equal(notifier.sent.length, 0);
  });

  it('counts failures, never as a change, and deactivates at the limit', async () => {
    let observe = await create();
    for (let i = 0; i < 3; i++) {
      scraper.queue.push(failure(ScrapeFailure.HttpError));
      // eslint-disable-next-line no-await-in-loop
      observe = (await manager.processObserve(observe)).observe;
    }

    assert.equal(observe.active, false);
    assert.equal(observe.consecutiveTimeouts, 3);
    assert.equal(observe.lastState, 'present');
    assert.equal(notifier.sent.length, 1, 'only the deactivation notice');
    assert.match(notifier.sent[0].embeds[0].toJSON().description ?? '', /deactivated/);
  });

  it('resets the failure streak after a good check', async () => {
    let observe = await create();
    scraper.queue.push(failure(), page(true));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(observe.consecutiveTimeouts, 1);
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(observe.consecutiveTimeouts, 0);
    assert.equal(observe.timeouts, 1);
  });

  it('reactivating after a change waits for the next one', async () => {
    let observe = await create();
    scraper.queue.push(page(false), page(false));
    observe = (await manager.processObserve(observe)).observe;
    assert.equal(observe.active, false);

    await manager.setActive(observe, true);
    observe = await reload(observe.id);
    assert.equal(observe.active, true);
    assert.equal(Number(observe.nextScrapeAtMS), 0);

    scraper.queue.push(page(false));
    await manager.processObserve(observe);
    assert.equal(notifier.sent.length, 1, 'no repeat for the same change');
  });

  it('never checks the same Observe twice at once', async () => {
    const observe = await create();
    let release!: () => void;
    const slow = new Promise<ScrapeResult>((resolve) => {
      release = () => {
        resolve(page(true));
      };
    });
    const original = scraper.scrape.bind(scraper);
    scraper.scrape = async () => slow;
    const first = manager.processObserve(observe);
    assert.equal(manager.isBusy(observe), true);
    assert.equal((await manager.processObserve(observe)).outcome, 'busy');
    release();
    assert.equal((await first).outcome, 'unchanged');
    scraper.scrape = original;
    assert.equal(manager.isBusy(observe), false);
  });

  it('refuses to edit an Observe while it is being checked', async () => {
    const observe = await create();
    let release!: () => void;
    const original = scraper.scrape.bind(scraper);
    scraper.scrape = async () =>
      new Promise<ScrapeResult>((resolve) => {
        release = () => {
          resolve(page(true));
        };
      });
    const check = manager.processObserve(observe);
    const edit = await manager.editObserve('guild', 'user', observe.name, {
      keepActive: true,
    });
    assert.equal(edit.successful, false);
    assert.match(edit.message ?? '', /being checked/);
    release();
    await check;
    scraper.scrape = original;
  });

  it('re-validates a changed target on edit and keeps the old one if it fails', async () => {
    const observe = await create();
    scraper.queue.push(page(false));
    const result = await manager.editObserve('guild', 'user', observe.name, {
      watchText: 'typo',
    });
    assert.equal(result.successful, false);
    assert.equal((await reload(observe.id)).watchText, 'sold out');

    // Non-target edits don't scrape at all.
    const renamed = await manager.editObserve('guild', 'user', observe.name, {
      keepActive: true,
    });
    assert.equal(renamed.successful, true);
    assert.equal(scraper.calls, 2);
  });

  it('keeps only the latest 50 history entries', async () => {
    let observe = await create();
    for (let i = 0; i < 55; i++) {
      scraper.queue.push(page(true));
      // eslint-disable-next-line no-await-in-loop
      observe = (await manager.processObserve(observe)).observe;
    }

    assert.equal(await prisma.scrapeLog.count({ where: { observeId: observe.id } }), 50);
  });

  it('deleting an Observe removes its history', async () => {
    const observe = await create();
    await manager.deleteObserve(observe);
    assert.equal(await prisma.scrapeLog.count({ where: { observeId: observe.id } }), 0);
  });
});
