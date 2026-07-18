import { Client } from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape.js';
import SettingsService from '../services/settings.js';
import { TYPES } from '../types.js';
import {
  ScrapeResult,
  ScrapeResultType,
} from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';
import { buildObserveEmbed } from '../utils/build-embed.js';
import debug from '../utils/debug.js';
import { prisma } from '../utils/db.js';
import ObserveManager from './observe.js';

@injectable()
export default class {
  private _inObservation: Observe[] = [];

  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService,
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
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
        this.processObserve(observe)
          .catch((error) => debug(error))
          .finally(() => this.removeFromObservation(observe));
      }
    }
  }

  private async processObserve(observe: Observe): Promise<void> {
    const scrapeResult = await this.scrapeService.observe(observe);

    await prisma.observe.updateMany({
      where: {
        guildId: observe.guildId,
        userId: observe.userId,
        name: observe.name,
      },
      data: {
        lastScrapeAtMS: Date.now(),
        thumbnail: observe.thumbnail,
        amountScraped: observe.amountScraped + 1,
      },
    });

    await this.handleScrapeResult(observe, scrapeResult);
  }

  private removeFromObservation(observe: Observe): void {
    const index = this._inObservation.findIndex((inObservation) =>
      inObservation.equals(observe)
    );

    if (index !== -1) {
      this._inObservation.splice(index, 1);
    }
  }

  private async handleScrapeResult(
    observe: Observe,
    scrapeResult: ScrapeResult
  ): Promise<void> {
    if (scrapeResult.type == ScrapeResultType.Timeout) {
      const settings = await this.settingsService.getSettings(observe.guildId);
      const consecutiveTimeouts = observe.consecutiveTimeouts + 1;
      // The bot used to *tell* users a maxed-out Observe "has been deactivated"
      // without ever actually flipping `active` to false, so it kept timing out
      // (and re-sending that same message) forever. Actually deactivate it here.
      const hasReachedTimeoutLimit =
        consecutiveTimeouts >= settings.consecutiveTimeoutsLimit;

      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          consecutiveTimeouts,
          timeouts: observe.timeouts + 1,
          active: hasReachedTimeoutLimit ? false : undefined,
        },
      });

      await this.handleTimeoutScenarios(observe, settings);
      return;
    }

    if (observe.consecutiveTimeouts != 0) {
      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          consecutiveTimeouts: 0,
        },
      });
    }

    if (scrapeResult.type == ScrapeResultType.Change) {
      await prisma.observe.updateMany({
        where: {
          guildId: observe.guildId,
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          active: observe.keepActive,
        },
      });

      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content:
          'A change has been found for your following Observe - check quickly!',
        embeds: [buildObserveEmbed(observe)],
      });
    }
  }

  private async handleTimeoutScenarios(
    observe: Observe,
    settings: Awaited<ReturnType<SettingsService['getSettings']>>
  ): Promise<void> {
    if (observe.consecutiveTimeouts == 0 && settings.notifyOnFirstTimeout) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `While trying to Observe \`${observe.name}\` on \`${observe.url}\`, we ran into a timeout. Check if the page itself still works and adjust if necessary. The bot will try again until it ran into a timeout \`${settings.consecutiveTimeoutsLimit}\` times consecutively where it will deactivate this Observe!`,
        embeds: [buildObserveEmbed(observe, { color: 'Orange' })],
      });
    } else if (
      observe.consecutiveTimeouts >=
      settings.consecutiveTimeoutsLimit - 1
    ) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `Your Observe \`${observe.name}\` on \`${observe.url}\`has reached the maximum amount of consecutive timeouts and has been deactivated!`,
        embeds: [buildObserveEmbed(observe, { color: 'DarkRed' })],
      });
    } else if (observe.timeouts == settings.timeoutsTillNotify - 1) {
      const user = await this.client.users.fetch(observe.userId);
      await user.send({
        content: `Your Observe \`${observe.name}\` on \`${observe.url}\`has reached a total of ${settings.timeoutsTillNotify} timeouts. Make sure the URL is working. It might just temporarily (or sometimes) response slow which results in such a timeout. The bot might also have a too tight timeout window which an admin of this server could increase. Nonetheless: a timeout means no actual scraping has been done and depending on your scrape interval, this could leave huge time gaps where we don't know if one of your Observes might have changed. Any form of action is therefore advised!`,
        embeds: [buildObserveEmbed(observe, { color: 'Orange' })],
      });
    }
  }
}
