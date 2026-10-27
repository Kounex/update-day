import 'reflect-metadata';
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import DraftStore, { DRAFT_TTL_MS, emptyDraftInput } from './drafts.js';

const owner = { userId: 'user', guildId: 'guild', channelId: 'channel' };

describe('DraftStore', () => {
  it('returns a draft only to its owner', () => {
    const store = new DraftStore();
    const draft = store.create(owner, emptyDraftInput());
    assert.equal(store.get(draft.id, 'user'), draft);
    assert.equal(store.get(draft.id, 'someone else'), undefined);
    assert.ok(draft.id.length <= 10);
  });

  it('expires drafts, and every use extends their life', () => {
    let now = 0;
    const store = new DraftStore(() => now);
    const draft = store.create(owner, emptyDraftInput());
    now = DRAFT_TTL_MS - 1;
    assert.ok(store.get(draft.id, 'user'));
    now += DRAFT_TTL_MS - 1;
    assert.ok(store.get(draft.id, 'user'), 'still alive after being used');
    now += DRAFT_TTL_MS + 1;
    assert.equal(store.get(draft.id, 'user'), undefined);
  });

  it('keeps the number of drafts bounded', () => {
    const store = new DraftStore();
    const first = store.create(owner, emptyDraftInput());
    for (let i = 0; i < 250; i++) {
      store.create(owner, emptyDraftInput());
    }

    assert.equal(store.get(first.id, 'user'), undefined);
  });
});
