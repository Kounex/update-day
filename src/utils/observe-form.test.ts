import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DraftStore, { emptyDraftInput } from '../managers/drafts.js';
import {
  MAX_NAME_LENGTH,
  MAX_SELECTOR_LENGTH,
  MAX_URL_LENGTH,
  MAX_WATCH_TEXT_LENGTH,
  NotifyMode,
  WatchMode,
} from '../types/models/observe.js';
import {
  buildDraftMessage,
  buildObserveModal,
  readObserveModal,
} from './observe-form.js';

const owner = { userId: '123456789012345678', guildId: 'guild', channelId: 'channel' };

const fields = (values: Record<string, string>, mode: string | null) => ({
  getTextInputValue: (id: string) => values[id] ?? '',
  getRadioGroup: () => mode,
});

describe('readObserveModal', () => {
  it('reads the form and keeps the settings it does not ask for', () => {
    const current = {
      ...emptyDraftInput(),
      scrapeInterval: 'Daily',
      keepActive: true,
      notifyMode: NotifyMode.Both,
    };
    const input = readObserveModal(
      fields(
        {
 name: ' Hoodie ', url: ' https://shop.test/x ', text: ' Sold out ', selector: '  ',
},
        WatchMode.Appears
      ),
      current
    );
    assert.deepEqual(input, {
      ...current,
      name: 'Hoodie',
      url: 'https://shop.test/x',
      watchText: 'Sold out',
      watchMode: WatchMode.Appears,
      cssSelector: null,
    });
  });

  it('treats a missing value of an empty optional field as empty', () => {
    const input = readObserveModal(
      {
        getTextInputValue: (id: string) => (id === 'name' ? 'n' : (undefined as unknown as string)),
        getRadioGroup: () => null,
      },
      emptyDraftInput()
    );
    assert.equal(input.watchText, '');
    assert.equal(input.cssSelector, null);
  });

  it('keeps the current mode if none was picked', () => {
    const input = readObserveModal(fields({}, null), {
      ...emptyDraftInput(),
      watchMode: WatchMode.Changes,
    });
    assert.equal(input.watchMode, WatchMode.Changes);
  });
});

describe('form messages stay within Discord limits', () => {
  const longest = {
    ...emptyDraftInput(),
    name: 'n'.repeat(MAX_NAME_LENGTH),
    url: `https://shop.test/${'u'.repeat(MAX_URL_LENGTH - 18)}`,
    watchText: 't'.repeat(MAX_WATCH_TEXT_LENGTH),
    cssSelector: 's'.repeat(MAX_SELECTOR_LENGTH),
  };

  for (const [label, editingId] of [['new', undefined], ['edit', 123_456_789]] as const) {
    it(`builds a valid ${label} form and preview`, () => {
      const draft = new DraftStore().create(owner, longest, editingId);
      const modal = buildObserveModal(draft).toJSON();
      assert.ok(modal.components.length <= 5, 'at most 5 fields per modal');
      assert.ok(modal.custom_id.length <= 100);
      assert.ok(modal.title.length <= 45);

      const message = buildDraftMessage(draft);
      const rows = (message.components ?? []).map((row) => row.toJSON());
      assert.ok(rows.length <= 5);
      for (const row of rows) {
        assert.ok(row.components.length <= 5);
        for (const component of row.components) {
          if ('custom_id' in component) {
            assert.ok(component.custom_id.length <= 100, component.custom_id);
          }

          if ('options' in component) {
            assert.ok(component.options.length <= 25);
            assert.equal(component.options.filter((option) => option.default).length, 1);
          }
        }
      }
    });
  }
});
