import { injectable } from 'inversify/lib/annotation/injectable';
import puppeteer, { Browser } from 'puppeteer';
import { ScrapeResult, ScrapeResultType } from '../types/classes/scrape-result';
import { Observe } from '../types/models/observe';

@injectable()
export default class ScrapeService {
  private readonly _browser: Promise<Browser>;

  constructor() {
    this._browser = puppeteer.launch();
  }

  async observe(observe: Observe, initial?: boolean): Promise<ScrapeResult> {
    const page = await (await this._browser).newPage();

    await page.goto(observe.url);

    var element;
    try {
      element = await page.waitForSelector(observe.cssSelector, {
        timeout: 10_000,
      });

      if (element == null) {
        throw Error;
      }
    } catch (_) {
      return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
    }

    var text;
    try {
      text = await element.evaluate((el) => el.textContent);

      if (
        !!initial &&
        (text == null ||
          text == undefined ||
          !text
            .toLocaleLowerCase()
            .trim()
            .includes(observe.currentText.toLocaleLowerCase().trim()))
      ) {
        throw Error;
      }
    } catch (_) {
      return new ScrapeResult(observe, ScrapeResultType.TextNotFound);
    }

    if (
      text == null ||
      text == undefined ||
      !text
        .toLocaleLowerCase()
        .trim()
        .includes(observe.currentText.toLocaleLowerCase().trim())
    ) {
      return new ScrapeResult(observe, ScrapeResultType.Change);
    }

    return new ScrapeResult(observe, ScrapeResultType.NoChange);
  }
}
