import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toChoices } from './observe-name-autocomplete.js';

describe('toChoices', () => {
  it('caps the list at 25 and drops values Discord would reject', () => {
    const values = [
      ...Array.from({ length: 30 }, (_, index) => `name ${index}`),
      'x'.repeat(101),
      '',
    ];
    const choices = toChoices(['y'.repeat(101), '', ...values]);
    assert.equal(choices.length, 25);
    assert.ok(choices.every((choice) => choice.value.length <= 100));
    assert.ok(choices.every((choice) => choice.value.length > 0));
  });
});
