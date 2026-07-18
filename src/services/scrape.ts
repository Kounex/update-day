import { inject, injectable } from 'inversify';
import pRetry from 'p-retry';
import puppeteer, { Browser } from 'puppeteer';
import {
  ScrapeResult,
  ScrapeResultType,
} from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';

import { TYPES } from '../types.js';
import debug from '../utils/debug.js';
import SettingsService from './settings.js';

@injectable()
export default class ScrapeService {
  constructor(
    @inject(TYPES.Services.Settings)
    private readonly settingsService: SettingsService
  ) {}

  async observe(observe: Observe, initial?: boolean): Promise<ScrapeResult> {
    const settings = await this.settingsService.getSettings(observe.guildId);
    const timeoutMS = settings.timeout * 1_000;

    // A browser is a real OS process/resource - make sure it always gets closed,
    // even if navigation, scraping or an unexpected error blows up below.
    let browser: Browser | undefined;
    try {
      browser = await puppeteer.launch();
      const page = await browser.newPage();

      try {
        // Transient network blips (DNS hiccups, connection resets) shouldn't
        // immediately mark an Observe as timed out - retry navigation a couple
        // times with backoff before giving up.
        await pRetry(async () => page.goto(observe.url, { timeout: timeoutMS }), {
          retries: 2,
          minTimeout: 2_000,
        });
      } catch (error) {
        debug(error);
        return new ScrapeResult(observe, ScrapeResultType.Timeout);
      }

      const links = await page.$$('head [type^="image/"]');

      if (links.length > 0) {
        let thumbnail = await links[0].evaluate((el) =>
          el.getAttribute('href')
        );

        if (thumbnail != null) {
          try {
            let url: URL;
            const observeURL = new URL(observe.url);
            thumbnail = thumbnail.split('//').join('');
            if (thumbnail.startsWith('/')) {
              url = new URL(`${observeURL.origin}${thumbnail}`);
            } else {
              url = new URL(`https://${thumbnail}`);
            }
            observe.thumbnail = `${observeURL.origin}${url.pathname}`;
          } catch (error) {
            debug(error);
          }
        }
      }

      // No selector means "the whole page" - most users just want to watch
      // for a phrase disappearing without hunting for a precise, deeply
      // nested unique selector. A selector (when given) only narrows the
      // search area, e.g. to avoid a phrase that also shows up in a nav bar
      // or on unrelated products elsewhere on the page.
      const scopeSelector = observe.cssSelector ?? 'body';

      let scopeElement;
      try {
        scopeElement = await page.waitForSelector(scopeSelector, {
          timeout: timeoutMS,
        });
      } catch (error) {
        debug(error);
        try {
          await page.waitForNetworkIdle({ timeout: 1_000 });
          if (!!initial) {
            return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
          }
          return new ScrapeResult(observe, ScrapeResultType.Change);
        } catch (idleError) {
          debug(idleError);
          return new ScrapeResult(observe, ScrapeResultType.Timeout);
        }
      }

      // innerText (not textContent) so this only sees text a visitor would
      // actually see rendered - hidden elements, <script>/<style> contents,
      // etc. are excluded, which matters a lot once the scope is as broad
      // as the whole page.
      const text = await scopeElement!.evaluate(
        (el) => (el as HTMLElement).innerText ?? el.textContent ?? ''
      );

      const phraseStillPresent = text
        .toLocaleLowerCase()
        .trim()
        .includes(observe.watchText.toLocaleLowerCase().trim());

      if (!phraseStillPresent) {
        if (!!initial) {
          return new ScrapeResult(observe, ScrapeResultType.TextNotFound);
        }

        return new ScrapeResult(observe, ScrapeResultType.Change);
      }

      return new ScrapeResult(observe, ScrapeResultType.NoChange);
    } catch (error) {
      debug(error);
      return new ScrapeResult(observe, ScrapeResultType.Timeout);
    } finally {
      try {
        await browser?.close();
      } catch (error) {
        debug(error);
      }
    }
  }
}
