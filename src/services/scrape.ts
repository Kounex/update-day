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

      let element;
      try {
        element = await page.waitForSelector(observe.cssSelector, {
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

      const domElementProperty = observe.domElementProperty;
      const text = await element!.evaluate(
        (el, domElementProperty) =>
          domElementProperty == null
            ? el.textContent
            : el.getAttribute(domElementProperty),
        domElementProperty
      );

      if (
        text == null ||
        !text
          .toLocaleLowerCase()
          .trim()
          .includes(observe.currentText.toLocaleLowerCase().trim())
      ) {
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
