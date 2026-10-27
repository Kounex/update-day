import { createHash } from 'crypto';
import { ScrapeSuccess } from '../types/classes/scrape-result.js';
import { WatchMode } from '../types/models/observe.js';

// Pages put words in separate elements, wrap lines and indent markup, so
// "Coming   soon" or "Coming\nSoon" has to match "coming soon".
export const normalizeText = (text: string): string =>
  text.replace(/\s+/g, ' ').trim();

const comparable = (text: string): string =>
  normalizeText(text).toLocaleLowerCase();

export const containsPhrase = (text: string, phrase: string): boolean =>
  comparable(text).includes(comparable(phrase));

export const hashText = (text: string): string =>
  createHash('sha256').update(normalizeText(text)).digest('hex').slice(0, 16);

export const PRESENT = 'present';
export const ABSENT = 'absent';

export interface Evaluation {
  // What to remember as `lastState` once this has been dealt with
  state: string;
  // Whether this result is something the user has to be told about
  triggered: boolean;
}

// The state a text mode notifies about.
const triggerStateOf = (mode: WatchMode): string =>
  mode === WatchMode.Appears ? PRESENT : ABSENT;

// Notifications fire on *transitions* into the triggering state, judged
// against the last state the user was told about. A keep-active Observe
// whose text stays gone therefore notifies once, not on every check, and
// re-arms on its own once the text is back.
export const evaluate = (
  observe: { watchMode: WatchMode; lastState: string | null },
  result: Pick<ScrapeSuccess, 'text' | 'matchFound'>
): Evaluation => {
  if (observe.watchMode === WatchMode.Changes) {
    const state = hashText(result.text);
    return {
      state,
      // No baseline yet: this check becomes it.
      triggered: observe.lastState !== null && observe.lastState !== state,
    };
  }

  const state = result.matchFound ? PRESENT : ABSENT;
  const triggerState = triggerStateOf(observe.watchMode);
  return {
    state,
    triggered: state === triggerState && observe.lastState !== triggerState,
  };
};

// For a new Observe or a changed target: is the page in a state where
// watching makes sense, and what's the baseline? Disappears needs the text
// on the page now, Appears needs it absent, Changes needs some text.
export const validateBaseline = (
  mode: WatchMode,
  result: Pick<ScrapeSuccess, 'text' | 'matchFound'>
): { baseline: string } | { problem: 'TextNotFound' | 'TextAlreadyThere' | 'NoText' } => {
  switch (mode) {
    case WatchMode.Disappears: {
      return result.matchFound ? { baseline: PRESENT } : { problem: 'TextNotFound' };
    }

    case WatchMode.Appears: {
      return result.matchFound
        ? { problem: 'TextAlreadyThere' }
        : { baseline: ABSENT };
    }

    case WatchMode.Changes: {
      return normalizeText(result.text).length > 0
        ? { baseline: hashText(result.text) }
        : { problem: 'NoText' };
    }
  }
};

// A short excerpt of `text` around `phrase` (or its start), for previews.
export const snippet = (text: string, phrase?: string, radius = 120): string => {
  const flat = normalizeText(text);
  if (flat.length === 0) {
    return '';
  }

  const index = phrase ? comparable(flat).indexOf(comparable(phrase)) : -1;
  if (index < 0) {
    return flat.length > radius * 2 ? `${flat.slice(0, radius * 2)}…` : flat;
  }

  const start = Math.max(0, index - radius);
  const end = Math.min(flat.length, index + normalizeText(phrase!).length + radius);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`;
};
