import { randomBytes } from 'crypto';
import { injectable, unmanaged } from 'inversify';
import { ScrapeResult } from '../types/classes/scrape-result.js';
import {
  NotifyMode,
  Observe,
  ScrapeIntervalType,
  WatchMode,
} from '../types/models/observe.js';

// Everything the form flow collects before an Observe is saved.
export interface DraftInput {
  name: string;
  url: string;
  watchText: string;
  watchMode: WatchMode;
  cssSelector: string | null;
  scrapeInterval: string;
  keepActive: boolean;
  notifyMode: NotifyMode;
}

export interface Draft {
  id: string;
  userId: string;
  guildId: string;
  channelId: string | null;
  // Set when the draft edits an existing Observe instead of creating one.
  editingId?: number;
  input: DraftInput;
  // The check of the current target - reused when saving, so saving right
  // after the preview doesn't load the page again.
  scrapeResult?: ScrapeResult;
  scrapedAtMS?: number;
  valid: boolean;
  message?: string;
  expiresAtMS: number;
}

export const DRAFT_TTL_MS = 15 * 60 * 1000;
const MAX_DRAFTS = 200;

export const emptyDraftInput = (): DraftInput => ({
  name: '',
  url: '',
  watchText: '',
  watchMode: WatchMode.Disappears,
  cssSelector: null,
  scrapeInterval: ScrapeIntervalType[ScrapeIntervalType.Hourly],
  keepActive: false,
  notifyMode: NotifyMode.DM,
});

export const draftInputOf = (observe: Observe): DraftInput => ({
  name: observe.name,
  url: observe.url,
  watchText: observe.watchText,
  watchMode: observe.watchMode,
  cssSelector: observe.cssSelector,
  scrapeInterval: ScrapeIntervalType[observe.scrapeInterval.type],
  keepActive: observe.keepActive,
  notifyMode: observe.notifyMode,
});

// Half-filled forms between the modal and "Start watching". In memory on
// purpose: a draft is never saved data, and losing one on a restart just
// means filling in the form again.
@injectable()
export default class DraftStore {
  private readonly drafts = new Map<string, Draft>();

  // `now` is a test seam - the container doesn't inject it.
  constructor(@unmanaged() private readonly now: () => number = Date.now) {}

  public create(
    owner: { userId: string; guildId: string; channelId: string | null },
    input: DraftInput,
    editingId?: number
  ): Draft {
    this.prune();
    const draft: Draft = {
      id: randomBytes(6).toString('base64url'),
      ...owner,
      editingId,
      input,
      valid: false,
      expiresAtMS: this.now() + DRAFT_TTL_MS,
    };
    this.drafts.set(draft.id, draft);
    return draft;
  }

  // The draft if it exists, hasn't expired and belongs to `userId` - every
  // interaction with it also extends its life.
  public get(id: string, userId: string): Draft | undefined {
    const draft = this.drafts.get(id);
    if (!draft || draft.userId !== userId || draft.expiresAtMS < this.now()) {
      return undefined;
    }

    draft.expiresAtMS = this.now() + DRAFT_TTL_MS;
    return draft;
  }

  public delete(id: string): void {
    this.drafts.delete(id);
  }

  private prune(): void {
    for (const [id, draft] of this.drafts) {
      if (draft.expiresAtMS < this.now()) {
        this.drafts.delete(id);
      }
    }

    // Oldest first - Map keeps insertion order.
    while (this.drafts.size >= MAX_DRAFTS) {
      this.drafts.delete(this.drafts.keys().next().value!);
    }
  }
}
