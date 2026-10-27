import { Observe as PrismaObserve } from '@prisma/client';
import { parse } from 'css-what';

export enum ScrapeIntervalType {
  OneMinute,
  FiveMinutes,
  FifteenMinutes,
  Hourly,
  Daily,
}

const MINUTE_MS = 60 * 1000;

const INTERVAL_MS: Record<ScrapeIntervalType, number> = {
  [ScrapeIntervalType.OneMinute]: MINUTE_MS,
  [ScrapeIntervalType.FiveMinutes]: 5 * MINUTE_MS,
  [ScrapeIntervalType.FifteenMinutes]: 15 * MINUTE_MS,
  [ScrapeIntervalType.Hourly]: 60 * MINUTE_MS,
  [ScrapeIntervalType.Daily]: 24 * 60 * MINUTE_MS,
};

const INTERVAL_TEXT: Record<ScrapeIntervalType, string> = {
  [ScrapeIntervalType.OneMinute]: 'Every Minute',
  [ScrapeIntervalType.FiveMinutes]: 'Every 5 Minutes',
  [ScrapeIntervalType.FifteenMinutes]: 'Every 15 Minutes',
  [ScrapeIntervalType.Hourly]: 'Hourly',
  [ScrapeIntervalType.Daily]: 'Daily',
};

export class ScrapeInterval {
  public constructor(
    public readonly type: ScrapeIntervalType = ScrapeIntervalType.Hourly
  ) {}

  public static toEnumType(type: string): ScrapeIntervalType {
    return (
      ScrapeIntervalType[type as keyof typeof ScrapeIntervalType] ??
      ScrapeIntervalType.Hourly
    );
  }

  public static get enumValues(): string[] {
    return Object.keys(ScrapeIntervalType).filter((item) =>
      Number.isNaN(Number(item))
    );
  }

  public static enumText(type: ScrapeIntervalType | string): string {
    const enumType =
      typeof type === 'string' ? ScrapeInterval.toEnumType(type) : type;
    return INTERVAL_TEXT[enumType];
  }

  public get durationMS(): number {
    return INTERVAL_MS[this.type];
  }

  // ±10% (at most ±2 minutes) so checks don't hit a site on an exact,
  // machine-like beat, and a batch of Observes created together drifts apart.
  public nextScrapeAtMS(fromMS: number, random = Math.random): number {
    const jitter = Math.min(this.durationMS * 0.1, 2 * 60 * 1000);
    return Math.round(fromMS + this.durationMS + (((random() * 2) - 1) * jitter));
  }
}

export enum WatchMode {
  Disappears = 'Disappears',
  Appears = 'Appears',
  Changes = 'Changes',
}

export const watchModeText = (mode: WatchMode): string => {
  switch (mode) {
    case WatchMode.Disappears: {
      return 'Text disappears';
    }

    case WatchMode.Appears: {
      return 'Text appears';
    }

    case WatchMode.Changes: {
      return 'Content changes';
    }
  }
};

export enum NotifyMode {
  DM = 'DM',
  Channel = 'Channel',
  Both = 'Both',
}

export const notifyModeText = (mode: NotifyMode): string => {
  switch (mode) {
    case NotifyMode.DM: {
      return 'Direct message';
    }

    case NotifyMode.Channel: {
      return 'Channel';
    }

    case NotifyMode.Both: {
      return 'DM and channel';
    }
  }
};

export const toWatchMode = (value: string | null | undefined): WatchMode =>
  Object.values(WatchMode).includes(value as WatchMode)
    ? (value as WatchMode)
    : WatchMode.Disappears;

export const toNotifyMode = (value: string | null | undefined): NotifyMode =>
  Object.values(NotifyMode).includes(value as NotifyMode)
    ? (value as NotifyMode)
    : NotifyMode.DM;

// Discord caps a button's customId at 100 characters and an autocomplete
// choice at 100, so names stay well below that.
export const MAX_NAME_LENGTH = 50;
export const MAX_WATCH_TEXT_LENGTH = 200;
export const MAX_SELECTOR_LENGTH = 300;
export const MAX_URL_LENGTH = 1000;

export interface ObserveInput {
  guildId: string;
  userId: string;
  channelId?: string | null;
  name: string;
  url: string;
  cssSelector?: string | null;
  watchText?: string | null;
  watchMode?: string | null;
  notifyMode?: string | null;
  scrapeInterval?: string | ScrapeInterval | null;
  keepActive?: boolean | null;
}

export interface ObserveState {
  id: number;
  createdAtMS: bigint;
  updatedAtMS: bigint;
  active: boolean;
  lastScrapeAtMS: bigint;
  nextScrapeAtMS: bigint;
  lastState: string | null;
  lastText: string | null;
  lastResult: string | null;
  lastError: string | null;
  triggeredAtMS: bigint;
  consecutiveTimeouts: number;
  timeouts: number;
  thumbnail: string | null;
  amountScraped: number;
}

const NEW_OBSERVE_STATE: Omit<ObserveState, 'createdAtMS'> = {
  id: 0,
  updatedAtMS: BigInt(0),
  active: true,
  lastScrapeAtMS: BigInt(0),
  nextScrapeAtMS: BigInt(0),
  lastState: null,
  lastText: null,
  lastResult: null,
  lastError: null,
  triggeredAtMS: BigInt(0),
  consecutiveTimeouts: 0,
  timeouts: 0,
  thumbnail: null,
  amountScraped: 0,
};

export class Observe implements ObserveState {
  public readonly id: number;
  public readonly guildId: string;
  public readonly userId: string;
  public readonly channelId: string | null;
  public readonly createdAtMS: bigint;
  public readonly updatedAtMS: bigint;
  public readonly name: string;
  public readonly url: string;
  public readonly cssSelector: string | null;
  public readonly watchText: string;
  public readonly watchMode: WatchMode;
  public readonly notifyMode: NotifyMode;
  public readonly scrapeInterval: ScrapeInterval;
  public readonly keepActive: boolean;
  public readonly active: boolean;
  public readonly lastScrapeAtMS: bigint;
  public readonly nextScrapeAtMS: bigint;
  public readonly lastState: string | null;
  public readonly lastText: string | null;
  public readonly lastResult: string | null;
  public readonly lastError: string | null;
  public readonly triggeredAtMS: bigint;
  public readonly consecutiveTimeouts: number;
  public readonly timeouts: number;
  public readonly thumbnail: string | null;
  public readonly amountScraped: number;

  private constructor(input: ObserveInput, state: ObserveState) {
    this.guildId = input.guildId;
    this.userId = input.userId;
    this.channelId = input.channelId ?? null;
    this.name = input.name.trim();
    this.url = input.url.trim();
    const selector = input.cssSelector?.trim();
    // An empty selector means "whole page", same as none.
    this.cssSelector = selector ? selector : null;
    this.watchText = input.watchText?.trim() ?? '';
    this.watchMode = toWatchMode(input.watchMode);
    this.notifyMode = toNotifyMode(input.notifyMode);
    this.scrapeInterval =
      input.scrapeInterval instanceof ScrapeInterval
        ? input.scrapeInterval
        : new ScrapeInterval(
            ScrapeInterval.toEnumType(input.scrapeInterval ?? 'Hourly')
          );
    this.keepActive = input.keepActive ?? false;
    this.id = state.id;
    this.createdAtMS = state.createdAtMS;
    this.updatedAtMS = state.updatedAtMS;
    this.active = state.active;
    this.lastScrapeAtMS = state.lastScrapeAtMS;
    this.nextScrapeAtMS = state.nextScrapeAtMS;
    this.lastState = state.lastState;
    this.lastText = state.lastText;
    this.lastResult = state.lastResult;
    this.lastError = state.lastError;
    this.triggeredAtMS = state.triggeredAtMS;
    this.consecutiveTimeouts = state.consecutiveTimeouts;
    this.timeouts = state.timeouts;
    this.thumbnail = state.thumbnail;
    this.amountScraped = state.amountScraped;
  }

  // Validates user input; `state` carries over everything that isn't (ids,
  // counters, baselines) when editing an existing Observe.
  public static create(
    input: ObserveInput,
    state?: Partial<ObserveState>
  ): Observe | Error {
    const error = Observe.validate(input);
    if (error) {
      return { name: 'NotValidAttribute', message: error };
    }

    return new Observe(input, {
      ...NEW_OBSERVE_STATE,
      createdAtMS: BigInt(Date.now()),
      ...state,
    });
  }

  public static fromPrisma(observe: PrismaObserve): Observe {
    return new Observe(
      {
        guildId: observe.guildId,
        userId: observe.userId,
        channelId: observe.channelId,
        name: observe.name,
        url: observe.url,
        cssSelector: observe.cssSelector,
        watchText: observe.watchText,
        watchMode: observe.watchMode,
        notifyMode: observe.notifyMode,
        scrapeInterval: observe.scrapeIntervalType,
        keepActive: observe.keepActive,
      },
      observe
    );
  }

  // Everything the user controls - the part `/edit` changes.
  public toInput(): ObserveInput {
    return {
      guildId: this.guildId,
      userId: this.userId,
      channelId: this.channelId,
      name: this.name,
      url: this.url,
      cssSelector: this.cssSelector,
      watchText: this.watchText,
      watchMode: this.watchMode,
      notifyMode: this.notifyMode,
      scrapeInterval: this.scrapeInterval,
      keepActive: this.keepActive,
    };
  }

  public toPrisma() {
    return {
      guildId: this.guildId,
      userId: this.userId,
      channelId: this.channelId,
      createdAtMS: this.createdAtMS,
      updatedAtMS: this.updatedAtMS,
      name: this.name,
      url: this.url,
      cssSelector: this.cssSelector,
      watchText: this.watchText,
      watchMode: this.watchMode,
      notifyMode: this.notifyMode,
      scrapeIntervalType: ScrapeIntervalType[this.scrapeInterval.type],
      keepActive: this.keepActive,
      active: this.active,
      lastScrapeAtMS: this.lastScrapeAtMS,
      nextScrapeAtMS: this.nextScrapeAtMS,
      lastState: this.lastState,
      lastText: this.lastText,
      lastResult: this.lastResult,
      lastError: this.lastError,
      triggeredAtMS: this.triggeredAtMS,
      consecutiveTimeouts: this.consecutiveTimeouts,
      timeouts: this.timeouts,
      thumbnail: this.thumbnail,
      amountScraped: this.amountScraped,
    };
  }

  // Whether the target (what is scraped and how it's judged) differs - a
  // changed target needs a fresh validation scrape and baseline.
  public hasSameTarget(other: Observe): boolean {
    return (
      this.url === other.url &&
      this.cssSelector === other.cssSelector &&
      this.watchText === other.watchText &&
      this.watchMode === other.watchMode
    );
  }

  public equals(observe: Observe) {
    return (
      this.guildId === observe.guildId &&
      this.userId === observe.userId &&
      this.name === observe.name
    );
  }

  public static validate(input: ObserveInput): string | undefined {
    const name = input.name.trim();
    if (name.length < 1 || name.length > MAX_NAME_LENGTH) {
      return `The name must be between 1 and ${MAX_NAME_LENGTH} characters long.`;
    }

    const url = input.url.trim();
    if (url.length > MAX_URL_LENGTH || !Observe.isValidURL(url)) {
      return 'Not a valid URL - it has to be a full `http://` or `https://` address.';
    }

    const selector = input.cssSelector?.trim();
    if (selector) {
      if (selector.length > MAX_SELECTOR_LENGTH) {
        return `The CSS selector can be at most ${MAX_SELECTOR_LENGTH} characters long.`;
      }

      if (!Observe.isValidCSSSelector(selector)) {
        return 'Not a valid CSS selector!';
      }
    }

    const mode = toWatchMode(input.watchMode);
    const text = input.watchText?.trim() ?? '';
    if (mode === WatchMode.Changes) {
      if (!selector) {
        return 'The `Content changes` mode needs a `css-selector` - a whole page always changes somewhere (ads, timestamps, ...), so point it at the part you care about.';
      }
    } else if (text.length < 1) {
      return 'The `text` to watch for must not be empty in this mode.';
    } else if (text.length > MAX_WATCH_TEXT_LENGTH) {
      return `The \`text\` can be at most ${MAX_WATCH_TEXT_LENGTH} characters long.`;
    }

    return undefined;
  }

  private static isValidCSSSelector(selector: string): boolean {
    try {
      parse(selector);
      return true;
    } catch {
      return false;
    }
  }

  private static isValidURL(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }
}
