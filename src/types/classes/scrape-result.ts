import { Observe } from '../models/observe';

export enum ScrapeResultType {
  Change,
  NoChange,
  ElementNotFound,
  Unknown,
}
export class ScrapeResult {
  public readonly observe: Observe;

  private readonly _type: ScrapeResultType;

  constructor(observe: Observe, type: ScrapeResultType) {
    this.observe = observe;
    this._type = type;
  }

  public get successful(): boolean {
    return (
      this._type == ScrapeResultType.Change ||
      this._type == ScrapeResultType.NoChange
    );
  }

  public get message(): string {
    switch (this._type) {
      case ScrapeResultType.Change: {
        return 'Change detected, user should be notified!';
      }
      case ScrapeResultType.NoChange: {
        return 'No change detected.';
      }
      case ScrapeResultType.ElementNotFound: {
        return `Element with given CSS-Selector [${this.observe.cssSelector}] on website [[${this.observe.url}]] not found!`;
      }
      case ScrapeResultType.Unknown: {
        return `Unknown, not handled error occurred while trying to scrape:\n$observe`;
      }
    }
  }
}
