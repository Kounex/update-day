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
import { prisma } from '../utils/db.js';
import ObserveManager from './observe.js';

@injectable()
export default class {
  private _activeObserves: Observe[] = [];

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
    for (const observe of await this.observeManager.getObserves()) {
      this._activeObserves.push(observe);
      if (
        Number(observe.lastScrapeAtMS) + observe.scrapeInterval.durationMS <
        Date.now()
      ) {
        this.scrapeService.observe(observe).then(async (scrapeResult) => {
          prisma.observe.updateMany({
            where: {
              userId: observe.userId,
              name: observe.name,
            },
            data: {
              lastScrapeAtMS: Date.now(),
              thumbnail: observe.thumbnail,
            },
          });

          this.handleScrapeResult(observe, scrapeResult);
          this._activeObserves.splice(this._activeObserves.indexOf(observe), 1);
        });
      }
    }
  }

  private async handleScrapeResult(
    observe: Observe,
    scrapeResult: ScrapeResult
  ): Promise<void> {
    if (scrapeResult.type == ScrapeResultType.Timeout) {
      prisma.observe.updateMany({
        where: {
          userId: observe.userId,
          name: observe.name,
        },
        data: {
          consecutiveTimeouts: observe.consecutiveTimeouts + 1,
          timeouts: observe.timeouts + 1,
        },
      });

      this.handleTimeoutScenarios(observe);
    } else {
      if (observe.consecutiveTimeouts != 0) {
        prisma.observe.updateMany({
          where: {
            userId: observe.userId,
            name: observe.name,
          },
          data: {
            consecutiveTimeouts: 0,
          },
        });
      }

      if (scrapeResult.type == ScrapeResultType.Change) {
        this.client.users.fetch(observe.userId).then((user) =>
          user.send({
            content:
              'A change has been found for your following observe - check quickly!',
            embeds: [buildObserveEmbed(observe)],
          })
        );
      }
    }
  }

  private async handleTimeoutScenarios(observe: Observe): Promise<void> {
    this.settingsService.getSettings(observe.guildId).then((settings) => {
      if (observe.consecutiveTimeouts == 0 && settings.notifyOnFirstTimeout) {
        this.client.users.fetch(observe.userId).then((user) =>
          user.send({
            content: `While trying to observe \`${observe.name}\` on \`${observe.url}\`, we ran into a timeout. Check if the page itself still works and adjust if necessary. The bot will try again until it ran into a timeout 3 times consecutively where it will deactivate this Observe!`,
            embeds: [buildObserveEmbed(observe, { color: 'DarkOrange' })],
          })
        );
      } else if (
        observe.consecutiveTimeouts >=
        settings.consecutiveTimeoutsLimit - 1
      ) {
        this.client.users.fetch(observe.userId).then((user) =>
          user.send({
            content: `Your Observe \`${observe.name}\` on \`${observe.url}\`has reached the maximum amount of consecutive timeouts and has been deactivated!`,
            embeds: [buildObserveEmbed(observe, { color: 'DarkRed' })],
          })
        );
      } else if (observe.timeouts == settings.timeoutsTillNotify - 1) {
        this.client.users.fetch(observe.userId).then((user) =>
          user.send({
            content: `Your Observe \`${observe.name}\` on \`${observe.url}\`has reached a total of ${settings.timeoutsTillNotify} timeouts. Make sure the URL is working. It might just temporarily (or sometimes) response slow which results in such a timeout. The bot might also have a too tight timeout window which an admin of this server could increase. Nonetheless: a timeout means no actual scraping has been done and depending on your scrape interval, this could leave huge time gaps where we don't know if one of your Observes might have changed. Any form of action is therefore advised!`,
            embeds: [buildObserveEmbed(observe, { color: 'DarkRed' })],
          })
        );
      }
    });
  }
}
