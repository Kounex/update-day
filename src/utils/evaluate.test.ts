import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { WatchMode } from '../types/models/observe.js';
import {
  ABSENT,
  containsPhrase,
  evaluate,
  hashText,
  PRESENT,
  snippet,
  validateBaseline,
} from './evaluate.js';

const found = { text: 'x', matchFound: true };
const missing = { text: 'x', matchFound: false };

describe('containsPhrase', () => {
  it('ignores case and collapses whitespace on both sides', () => {
    assert.equal(containsPhrase('Price\n  COMING\tSoon!', 'coming soon'), true);
    assert.equal(containsPhrase('Coming soon', '  coming   soon '), true);
    assert.equal(containsPhrase('In stock', 'coming soon'), false);
  });
});

describe('evaluate - Disappears', () => {
  const mode = WatchMode.Disappears;

  it('triggers when the text goes missing', () => {
    assert.deepEqual(evaluate({ watchMode: mode, lastState: PRESENT }, missing), {
      state: ABSENT,
      triggered: true,
    });
  });

  it('treats an unknown baseline like present (migrated Observes)', () => {
    assert.equal(evaluate({ watchMode: mode, lastState: null }, missing).triggered, true);
  });

  it('does not re-trigger while it stays missing', () => {
    assert.equal(evaluate({ watchMode: mode, lastState: ABSENT }, missing).triggered, false);
  });

  it('re-arms quietly when the text comes back', () => {
    assert.deepEqual(evaluate({ watchMode: mode, lastState: ABSENT }, found), {
      state: PRESENT,
      triggered: false,
    });
  });
});

describe('evaluate - Appears', () => {
  const mode = WatchMode.Appears;

  it('triggers when the text shows up', () => {
    assert.equal(evaluate({ watchMode: mode, lastState: ABSENT }, found).triggered, true);
  });

  it('stays quiet while it is still absent or still present', () => {
    assert.equal(evaluate({ watchMode: mode, lastState: ABSENT }, missing).triggered, false);
    assert.equal(evaluate({ watchMode: mode, lastState: PRESENT }, found).triggered, false);
  });
});

describe('evaluate - Changes', () => {
  const mode = WatchMode.Changes;

  it('takes the first check as baseline', () => {
    const result = evaluate({ watchMode: mode, lastState: null }, { text: 'a', matchFound: null });
    assert.equal(result.triggered, false);
    assert.equal(result.state, hashText('a'));
  });

  it('triggers on different text, ignoring whitespace-only differences', () => {
    const lastState = hashText('Price: 10 €');
    assert.equal(
      evaluate({ watchMode: mode, lastState }, { text: 'Price:\n  10 €', matchFound: null }).triggered,
      false
    );
    assert.equal(
      evaluate({ watchMode: mode, lastState }, { text: 'Price: 8 €', matchFound: null }).triggered,
      true
    );
  });
});

describe('validateBaseline', () => {
  it('needs the text present for Disappears and absent for Appears', () => {
    assert.deepEqual(validateBaseline(WatchMode.Disappears, found), { baseline: PRESENT });
    assert.deepEqual(validateBaseline(WatchMode.Disappears, missing), { problem: 'TextNotFound' });
    assert.deepEqual(validateBaseline(WatchMode.Appears, missing), { baseline: ABSENT });
    assert.deepEqual(validateBaseline(WatchMode.Appears, found), { problem: 'TextAlreadyThere' });
  });

  it('needs some text for Changes', () => {
    assert.deepEqual(validateBaseline(WatchMode.Changes, { text: '  \n ', matchFound: null }), {
      problem: 'NoText',
    });
  });
});

describe('snippet', () => {
  it('cuts around the phrase', () => {
    const text = `${'a '.repeat(200)}Coming soon${' b'.repeat(200)}`;
    const result = snippet(text, 'coming soon', 10);
    assert.match(result, /^….*Coming soon.*…$/);
    assert.ok(result.length < 40);
  });

  it('falls back to the start when the phrase is missing', () => {
    assert.equal(snippet('short text', 'missing'), 'short text');
  });
});
