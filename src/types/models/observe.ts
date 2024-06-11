import { Observe as PrismaObserve } from '@prisma/client';
import { parse } from 'css-what';

export enum ScrapeIntervalType {
  OneMinute,
  FiveMinutes,
  FifteenMinutes,
  Hourly,
  Daily,
}

export class ScrapeInterval {
  public constructor(
    public readonly type: ScrapeIntervalType = ScrapeIntervalType.Hourly
  ) {}

  public static toEnumType(type: string): ScrapeIntervalType {
    return ScrapeIntervalType[type as keyof typeof ScrapeIntervalType];
  }

  public static get enumValues(): string[] {
    return Object.keys(ScrapeIntervalType).filter((item) => {
      return isNaN(Number(item));
    });
  }

  public static enumText(type: ScrapeIntervalType | string): string {
    const enumType =
      typeof type == 'string' ? ScrapeInterval.toEnumType(type) : type;
    switch (enumType) {
      case ScrapeIntervalType.OneMinute: {
        return 'Every Minute';
      }
      case ScrapeIntervalType.FiveMinutes: {
        return 'Every 5 Minutes';
      }
      case ScrapeIntervalType.FifteenMinutes: {
        return 'Every 15 Minutes';
      }
      case ScrapeIntervalType.Hourly: {
        return 'Hourly';
      }
      case ScrapeIntervalType.Daily: {
        return 'Daily';
      }
    }
  }

  public get durationMS(): number {
    switch (this.type) {
      case ScrapeIntervalType.OneMinute: {
        return 60 * 1000;
      }
      case ScrapeIntervalType.FiveMinutes: {
        return 5 * 60 * 1000;
      }
      case ScrapeIntervalType.FifteenMinutes: {
        return 15 * 60 * 1000;
      }
      case ScrapeIntervalType.Hourly: {
        return 60 * 60 * 1000;
      }
      case ScrapeIntervalType.Daily: {
        return 24 * 60 * 60 * 1000;
      }
    }
  }
}

export class Observe {
  private constructor(
    public readonly guildId: string,
    public readonly userId: string,
    public readonly createdAtMS: bigint,
    public readonly updatedAtMS: bigint,
    public readonly name: string,
    public readonly url: string,
    public readonly cssSelector: string,
    public readonly currentText: string,
    public readonly domElementProperty: string | null,
    public readonly scrapeInterval: ScrapeInterval = new ScrapeInterval(
      ScrapeIntervalType.Hourly
    ),
    public readonly keepActive: boolean = false,
    public readonly active: boolean = true,
    public readonly lastScrapeAtMS: bigint = BigInt(0),
    public readonly consecutiveTimeouts: number = 0
  ) {}

  public static create(
    guildId: string,
    userId: string,
    createdAtMS: number | bigint,
    updatedAtMS: number | bigint,
    name: string,
    url: string,
    cssSelector: string,
    currentText: string,
    scrapeInterval: string | ScrapeInterval | null,
    domElementProperty?: string | null,
    keepActive: boolean = false,
    active: boolean = true,
    lastScrapeAtMS: number | bigint = BigInt(0),
    consecutiveTimeouts: number = 0
  ): Observe | Error {
    if (!this.isValidURL(url.trim())) {
      return {
        name: 'NotValidAttribute',
        message:
          'Not a valid URL - has comply with the `URL` spec in general and contain `http` / `https`!',
      };
    }
    if (!this.isValidCSSSelector(cssSelector.trim())) {
      return {
        name: 'NotValidAttribute',
        message: 'Not a valid CSS-Selector!',
      };
    }

    return new Observe(
      guildId,
      userId,
      BigInt(createdAtMS),
      BigInt(updatedAtMS),
      name.trim(),
      url.trim(),
      cssSelector.trim(),
      currentText.trim(),
      domElementProperty?.trim() ?? null,
      scrapeInterval instanceof ScrapeInterval
        ? scrapeInterval
        : new ScrapeInterval(
            scrapeInterval != null
              ? ScrapeInterval.toEnumType(scrapeInterval)
              : ScrapeIntervalType.Hourly
          ),
      keepActive,
      active,
      BigInt(lastScrapeAtMS),
      consecutiveTimeouts
    );
  }

  public static fromPrisma(observe: PrismaObserve) {
    return new Observe(
      observe.guildId,
      observe.userId,
      observe.createdAtMS,
      observe.updatedAtMS,
      observe.name,
      observe.url,
      observe.cssSelector,
      observe.currentText,
      observe.domElementProperty,
      new ScrapeInterval(ScrapeInterval.toEnumType(observe.scrapeIntervalType)),
      observe.keepActive,
      observe.active,
      observe.lastScrapeAtMS,
      observe.consecutiveTimeouts
    );
  }

  public toPrisma() {
    return {
      data: {
        guildId: this.guildId,
        userId: this.userId,
        createdAtMS: this.createdAtMS,
        updatedAtMS: this.updatedAtMS,
        name: this.name,
        url: this.url,
        cssSelector: this.cssSelector,
        currentText: this.currentText,
        domElementProperty: this.domElementProperty,
        scrapeIntervalType: ScrapeIntervalType[this.scrapeInterval.type],
        keepActive: this.keepActive,
        active: this.active,
        lastScrapeAtMS: this.lastScrapeAtMS,
        consecutiveTimeouts: this.consecutiveTimeouts,
      },
    };
  }

  public toString(): string {
    return `${this.name}\n${this.cssSelector}\n${this.url}\n${
      this.currentText
    }${this.domElementProperty != null ? '\n' + this.name : ''}\n`;
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
