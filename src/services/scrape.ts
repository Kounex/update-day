import { injectable } from 'inversify/lib/annotation/injectable';
import puppeteer, { Browser } from 'puppeteer';
import {
  ScrapeResult,
  ScrapeResultType,
} from '../types/classes/scrape-result.js';
import { Observe } from '../types/models/observe.js';
import { prisma } from '../utils/db.js';

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
      await page.close();
      if (!!initial) {
        return new ScrapeResult(observe, ScrapeResultType.ElementNotFound);
      }
      return this.handleFoundChange(observe);
    }

    const domElementProperty = observe.domElementProperty;
    const text = await element.evaluate(
      (el, domElementProperty) =>
        domElementProperty == null
          ? el.textContent
          : el.getAttribute(domElementProperty),
      domElementProperty
    );

    await page.close();

    if (
      text == null ||
      text == undefined ||
      !text
        .toLocaleLowerCase()
        .trim()
        .includes(observe.currentText.toLocaleLowerCase().trim())
    ) {
      if (!!initial) {
        return new ScrapeResult(observe, ScrapeResultType.TextNotFound);
      }

      return this.handleFoundChange(observe);
    }

    return new ScrapeResult(observe, ScrapeResultType.NoChange);
  }

  private async handleFoundChange(observe: Observe): Promise<ScrapeResult> {
    await prisma.observe.updateMany({
      where: {
        userId: observe.userId,
        name: observe.name,
      },
      data: {
        active: observe.keepActive,
      },
    });

    return new ScrapeResult(observe, ScrapeResultType.Change);
  }
}
