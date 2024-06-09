import { Client } from 'discord.js';
import { inject, injectable } from 'inversify';
import ScrapeService from '../services/scrape.js';
import { TYPES } from '../types.js';
import { ScrapeResultType } from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';
import { buildObserveEmbed } from '../utils/build-embed.js';
import { prisma } from '../utils/db.js';
import ObserveManager from './observe.js';

@injectable()
export default class {
  private cachedObserves: Observe[] = [];
  private observing: boolean = false;

  constructor(
    @inject(TYPES.Client) private readonly client: Client,
    @inject(TYPES.Managers.Observe)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Services.Scrape) private readonly scrapeService: ScrapeService
  ) {}

  public init(): void {
    // To enable the checkObserves function to access this, we need to bind
    // setInterval(this.refreshCacheObserves.bind(this), 300_000);
    setInterval(this.checkObserves.bind(this), 15_000);
  }

  private async refreshCacheObserves(): Promise<void> {
    if (!this.observing) {
      this.cachedObserves = await this.observeManager.getObserves();
    }
  }

  private async checkObserves(): Promise<void> {
    this.observing = true;
    for (const observe of await this.observeManager.getObserves()) {
      if (
        Number(observe.lastScrapeAtMS) + observe.scrapeInterval.durationMS <
        Date.now()
      ) {
        this.scrapeService.observe(observe).then((scrapeResult) => {
          prisma.observe.updateMany({
            where: {
              userId: observe.userId,
              name: observe.name,
            },
            data: {
              lastScrapeAtMS: Date.now(),
            },
          });

          if (scrapeResult.type == ScrapeResultType.Change) {
            this.client.users.fetch(observe.userId).then((user) =>
              user.send({
                content:
                  'A change has been found for your following observe - check quickly!',
                embeds: [buildObserveEmbed(observe)],
              })
            );
          }
        });
      }
    }
    this.observing = false;
  }
}
