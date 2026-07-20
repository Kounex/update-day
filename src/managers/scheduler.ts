import { injectable, inject } from 'inversify';
import { TYPES } from '../types.js';
import { Observe } from '../types/models/observe.js';
import debug from '../utils/debug.js';
import ObserveManager from './observe.js';

@injectable()
export default class {
  private _inObservation: Observe[] = [];

  constructor(
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager
  ) {}

  public init(): void {
    setInterval(this.checkObserves.bind(this), 15_000);
  }

  private async checkObserves(): Promise<void> {
    for (const observe of await this.observeManager.getObserves({
      active: true,
    })) {
      if (
        !this._inObservation.some((inObserve) => inObserve.equals(observe)) &&
        Number(observe.lastScrapeAtMS) + observe.scrapeInterval.durationMS <
          Date.now()
      ) {
        this._inObservation.push(observe);

        // Never let a rejected promise here go unhandled - an unhandled rejection
        // crashes the whole bot process (e.g. a user with DMs disabled, or a
        // network error while scraping), and always release the observe from
        // `_inObservation` once we're done with it, success or failure, so it
        // doesn't get stuck forever and never scraped again.
        this.observeManager
          .processObserve(observe)
          .catch((error) => debug(error))
          .finally(() => this.removeFromObservation(observe));
      }
    }
  }

  private removeFromObservation(observe: Observe): void {
    const index = this._inObservation.findIndex((inObservation) =>
      inObservation.equals(observe)
    );

    if (index !== -1) {
      this._inObservation.splice(index, 1);
    }
  }
}
