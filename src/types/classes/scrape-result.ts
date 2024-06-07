import { Observe } from '../models/observe.js';

export enum ScrapeResultType {
  Change,
  NoChange,
  ElementNotFound,
  TextNotFound,
  Unknown,
}
export class ScrapeResult {
  constructor(
    public readonly observe: Observe,
    public readonly type: ScrapeResultType
  ) {}

  public get successful(): boolean {
    return (
      this.type == ScrapeResultType.Change ||
      this.type == ScrapeResultType.NoChange
    );
  }

  public get message(): string {
    switch (this.type) {
      case ScrapeResultType.Change: {
        return 'Change detected, user should be notified!';
      }
      case ScrapeResultType.NoChange: {
        return 'No change detected.';
      }
      case ScrapeResultType.ElementNotFound: {
        return `Element with given CSS-Selector \`${this.observe.cssSelector}\` on website \`${this.observe.url}\` not found!`;
      }
      case ScrapeResultType.TextNotFound: {
        return `Text \`${this.observe.currentText}\` not found for element with CSS-Selector \`${this.observe.cssSelector}\` on website \`${this.observe.url}\`!`;
      }
      case ScrapeResultType.Unknown: {
        return `Unknown, not handled error occurred while trying to scrape:\n$observe`;
      }
    }
  }
}
