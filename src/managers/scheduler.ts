import { log } from 'console';
import { Client } from 'discord.js';
import { inject } from 'inversify';
import { injectable } from 'inversify/lib/annotation/injectable';
import ScrapeService from '../services/scrape';
import { TYPES } from '../types';
import { buildObserveEmbed } from '../utils/build-embed';
import ObserveManager from './observe';

@injectable()
export default class {
  constructor(
    @inject(TYPES.Managers.Scrape)
    private readonly observeManager: ObserveManager,
    @inject(TYPES.Services.Scrape)
    private readonly scrapeService: ScrapeService,
    @inject(TYPES.Client) private readonly client: Client
  ) {
    setInterval(this.checkFunctions, 5000);
  }

  private async checkFunctions(): Promise<void> {
    for (const observe of await this.observeManager.getObserves()) {
      if (
        // observe.lastScrapeMS + observe.scrapeInterval.durationMS <
        // Date.now()
        true
      ) {
        // this.scrapeService.observe(observe).then((scrapeResult) => {
        //   if (scrapeResult.type == ScrapeResultType.Change) {
        log('TEST');
        this.client.users.fetch(observe.userId).then((user) =>
          user.send({
            content:
              'A change has been found for your following observe - check quickly!',
            embeds: [buildObserveEmbed(observe)],
          })
        );
        //   }
        // });
      }
    }
  }
}
