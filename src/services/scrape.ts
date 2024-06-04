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

  async observe(observe: Observe): Promise<ScrapeResult> {
    // const page = await (await this._browser).newPage();

    // await page.goto(observe.url);
    // const element = await page.$(observe.cssSelector);

    // if (element == null) {
    //   return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
    // }

    return new ScrapeResult(observe, ScrapeResultType.Unknown);
  }
}
