import { inject, injectable, unmanaged } from 'inversify';
import pRetry, { AbortError } from 'p-retry';
import {
 ElementHandle, HTTPRequest, Page, TimeoutError,
} from 'puppeteer';
import Config from '../config.js';
import { TYPES } from '../types.js';
import {
  ScrapeError,
  ScrapeFailure,
  ScrapeResult,
  ScrapeSuccess,
} from '../types/classes/scrape-result.js';
import { WatchMode } from '../types/models/observe.js';
import { containsPhrase, normalizeText } from '../utils/evaluate.js';
import logger from '../utils/logger.js';
import { NetworkGuard } from '../utils/network-guard.js';
import BrowserService, { DeadlineError } from './browser.js';

export interface ScrapeTarget {
  url: string;
  cssSelector: string | null;
  watchText: string;
  watchMode: WatchMode;
}

export interface ScrapeOptions {
  timeoutMS: number;
  screenshot?: boolean;
}

// Titles/markers of bot-protection interstitials (Cloudflare, Akamai,
// PerimeterX, DDoS-Guard, Imperva, ...). Seeing one means we never saw the
// real page, so "the text is gone" would be a lie.
const CHALLENGE_TITLE =
  /just a moment|attention required|access denied|verify(ing)? you are (a )?human|are you a robot|ddos-guard|request unsuccessful|pardon our interruption|security check/i;
const CHALLENGE_SELECTOR =
  '#challenge-form, #challenge-running, #cf-challenge-running, #px-captcha, #sec-if-cpt-container';

// How long to keep looking for the watched text in the Disappears mode
// before believing it's gone - covers content rendered late by scripts.
const LATE_RENDER_GRACE_MS = 5_000;
const NETWORK_IDLE_MAX_MS = 10_000;
const MAX_SCREENSHOT_HEIGHT = 1600;

@injectable()
export default class ScrapeService {
  private readonly guard: NetworkGuard;

  constructor(
    @inject(TYPES.Services.Browser)
    private readonly browserService: BrowserService,
    @inject(TYPES.Config)
    config: Pick<Config, 'ALLOW_PRIVATE_NETWORK'>,
    // Test seam only: the smoke test serves its fixtures on loopback.
    @unmanaged() guard?: NetworkGuard
  ) {
    this.guard =
      guard ??
      new NetworkGuard({ allowPrivateNetwork: config.ALLOW_PRIVATE_NETWORK });
  }

  public async scrape(
    target: ScrapeTarget,
    options: ScrapeOptions
  ): Promise<ScrapeResult> {
    const startedAt = Date.now();
    const fail = (
      failure: ScrapeFailure,
      detail: string,
      extra: Partial<ScrapeError> = {}
    ): ScrapeError => ({
      ok: false,
      failure,
      detail,
      httpStatus: null,
      finalUrl: target.url,
      title: '',
      ...extra,
      durationMS: Date.now() - startedAt,
    });

    try {
      await this.guard.check(target.url);
    } catch (error: unknown) {
      return fail(ScrapeFailure.NetworkBlocked, (error as Error).message);
    }

    try {
      // Navigation is retried up to twice, so the whole thing gets room for
      // three timeouts plus the waits after it.
      const deadlineMS = (options.timeoutMS * 4) + 30_000;
      const result = await this.browserService.withPage(
        async (page) => this.scrapePage(page, target, options, fail),
        { deadlineMS }
      );
      return { ...result, durationMS: Date.now() - startedAt };
    } catch (error: unknown) {
      if (error instanceof DeadlineError) {
        return fail(ScrapeFailure.Timeout, error.message);
      }

      logger.error(`Scrape of ${target.url} failed in the browser`, error);
      return fail(
        ScrapeFailure.BrowserError,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private async scrapePage(
    page: Page,
    target: ScrapeTarget,
    options: ScrapeOptions,
    fail: (
      failure: ScrapeFailure,
      detail: string,
      extra?: Partial<ScrapeError>
    ) => ScrapeError
  ): Promise<ScrapeResult> {
    const { timeoutMS } = options;

    // Some sites (e.g. anything behind a CloudFront/WAF bot rule) block
    // requests whose User-Agent literally contains "HeadlessChrome". Strip
    // that tag so we present as the same Chrome build - derived from the
    // real bundled UA so it can't drift out of sync with the browser.
    await page.setUserAgent({
      userAgent: (await page.browser().userAgent()).replace(
        'HeadlessChrome',
        'Chrome'
      ),
    });
    // A default 800x600 viewport can trip a site's mobile breakpoint and
    // serve a different (sometimes differently-structured) layout.
    await page.setViewport({ width: 1366, height: 900 });

    // Every request the page makes - the document, each redirect hop,
    // scripts, images, XHR - goes through the network guard, so neither a
    // redirect nor a script on a public page can reach a private address.
    let blockedNavigation: string | undefined;
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      this.guardRequest(request, (url) => {
        if (request.isNavigationRequest()) {
          blockedNavigation = url;
        }
      }).catch((error: unknown) => {
        logger.debug(error);
      });
    });

    let response;
    try {
      // Transient network blips (DNS hiccups, connection resets) shouldn't
      // immediately count as a failure - retry navigation a couple of times.
      response = await pRetry(
        async () => {
          try {
            return await page.goto(target.url, {
              timeout: timeoutMS,
              waitUntil: 'load',
            });
          } catch (error: unknown) {
            if (blockedNavigation) {
              throw new AbortError(error as Error);
            }

            throw error;
          }
        },
        { retries: 2, minTimeout: 2_000 }
      );
    } catch (error: unknown) {
      if (blockedNavigation) {
        return fail(
          ScrapeFailure.NetworkBlocked,
          `Redirected to a private or local address: ${blockedNavigation}`
        );
      }

      if (error instanceof TimeoutError) {
        return fail(ScrapeFailure.Timeout, error.message);
      }

      return fail(
        ScrapeFailure.Unreachable,
        error instanceof Error ? error.message : String(error)
      );
    }

    const httpStatus = response?.status() ?? null;

    // Give scripts a moment to fill the page (shops often load stock and
    // prices via XHR after `load`). Pages that never go idle (polling,
    // websockets) just continue after the cap.
    await page
      .waitForNetworkIdle({
        idleTime: 500,
        timeout: Math.min(NETWORK_IDLE_MAX_MS, timeoutMS),
      })
      .catch(() => undefined);

    if (await this.isChallengePage(page)) {
      // Some challenges solve themselves in a real browser after a few
      // seconds and then navigate to the real page.
      await page
        .waitForNavigation({ timeout: 10_000, waitUntil: 'load' })
        .catch(() => undefined);
      if (await this.isChallengePage(page)) {
        return fail(ScrapeFailure.Blocked, `Challenge page "${await page.title()}"`, {
          httpStatus,
          finalUrl: page.url(),
          title: await page.title(),
          screenshot: options.screenshot
            ? await this.screenshotViewport(page)
            : undefined,
        });
      }
    }

    const title = await page.title().catch(() => '');
    const finalUrl = page.url();

    if (httpStatus !== null && httpStatus >= 400) {
      return fail(ScrapeFailure.HttpError, `HTTP ${httpStatus}`, {
        httpStatus,
        finalUrl,
        title,
        screenshot: options.screenshot
          ? await this.screenshotViewport(page)
          : undefined,
      });
    }

    // No selector means "the whole page" - a selector (when given) only
    // narrows the search area, e.g. to avoid a phrase that also shows up in
    // a nav bar or on unrelated products elsewhere on the page.
    const scopeSelector = target.cssSelector ?? 'body';
    let scope: ElementHandle | null;
    try {
      scope = await page.waitForSelector(scopeSelector, { timeout: timeoutMS });
    } catch {
      scope = null;
    }

    if (!scope) {
      return fail(
        ScrapeFailure.ElementNotFound,
        `No element matches ${scopeSelector}`,
        { httpStatus, finalUrl, title }
      );
    }

    // Some sites mark sections `content-visibility: auto`, which skips
    // rendering off-screen content until it scrolls into view - innerText
    // reads as empty for such a section. Scroll it in, like a visitor would.
    await scope.evaluate((element) => {
      element.scrollIntoView({ block: 'center' });
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 250);
    });

    let text = await this.readText(scope);
    let matchFound = target.watchText
      ? containsPhrase(text, target.watchText)
      : null;

    if (
      target.watchMode === WatchMode.Disappears &&
      target.watchText &&
      !matchFound
    ) {
      // Before calling it gone, give late-rendering scripts a few more
      // seconds to put it on the page.
      const appeared = await page
        .waitForFunction(
          (selector: string, phrase: string) => {
            const element = document.querySelector<HTMLElement>(selector);
            const visible = (element?.innerText ?? '')
              .replace(/\s+/g, ' ')
              .toLocaleLowerCase();
            return visible.includes(phrase);
          },
          { timeout: LATE_RENDER_GRACE_MS, polling: 500 },
          scopeSelector,
          normalizeText(target.watchText).toLocaleLowerCase()
        )
        .then(() => true)
        .catch(() => false);
      if (appeared) {
        text = await this.readText(scope);
        matchFound = containsPhrase(text, target.watchText);
      }
    }

    const result: ScrapeSuccess = {
      ok: true,
      text,
      matchFound,
      httpStatus,
      finalUrl,
      title,
      durationMS: 0,
      thumbnail: await this.findThumbnail(page),
    };

    if (options.screenshot) {
      result.screenshot = await this.screenshot(page, scope, target, Boolean(matchFound));
    }

    return result;
  }

  private async guardRequest(
    request: HTTPRequest,
    // Called before the abort goes out, so `goto` can't reject first.
    onBlocked: (url: string) => void
  ): Promise<void> {
    const url = request.url();
    // Inline content never leaves the browser.
    const allowed = /^(data|blob):/i.test(url) || (await this.guard.isAllowed(url));
    try {
      if (allowed) {
        await request.continue();
      } else {
        if (request.isNavigationRequest()) {
          logger.warn(`Blocked navigation to a private/local address: ${url}`);
        } else {
          // Routine with an ad-blocking DNS, which answers trackers with
          // 0.0.0.0 - the page itself still loads fine.
          logger.debug(`Blocked sub-request to a private/local address: ${url}`);
        }

        onBlocked(url);
        await request.abort('blockedbyclient');
      }
    } catch (error: unknown) {
      // Already handled, or the page is gone.
      logger.debug(error);
    }
  }

  private async isChallengePage(page: Page): Promise<boolean> {
    try {
      const title = await page.title();
      if (CHALLENGE_TITLE.test(title)) {
        return true;
      }

      return (await page.$(CHALLENGE_SELECTOR)) !== null;
    } catch {
      return false;
    }
  }

  private async readText(scope: ElementHandle): Promise<string> {
    // innerText (not textContent) so this only sees text a visitor would
    // actually see rendered - hidden elements, <script>/<style> contents,
    // etc. are excluded, which matters once the scope is the whole page.
    return scope.evaluate(
      (element) => (element as HTMLElement).innerText ?? element.textContent ?? ''
    );
  }

  private async findThumbnail(page: Page): Promise<string | null> {
    try {
      // `.href` is already resolved against the page URL, unlike the raw
      // attribute (protocol-relative, relative, CDN-hosted, ...).
      const href = await page.evaluate(() => {
        const link = document.querySelector<HTMLLinkElement>(
          'link[rel~="icon"], link[rel="apple-touch-icon"], head link[type^="image/"]'
        );
        return link?.href ?? null;
      });
      return href && /^https?:\/\//.test(href) && href.length < 2000
        ? href
        : null;
    } catch {
      return null;
    }
  }

  private async screenshot(
    page: Page,
    scope: ElementHandle,
    target: ScrapeTarget,
    matchFound: boolean
  ): Promise<Buffer | undefined> {
    try {
      if (target.cssSelector) {
        const box = await scope.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          // boundingBox() is relative to the viewport, a screenshot clip to
          // the page - after scrolling the element into view they differ.
          const scroll = await page.evaluate(() => ({
            x: window.visualViewport?.pageLeft ?? window.scrollX,
            y: window.visualViewport?.pageTop ?? window.scrollY,
          }));
          return Buffer.from(
            await page.screenshot({
              type: 'jpeg',
              quality: 75,
              captureBeyondViewport: true,
              clip: {
                x: box.x + scroll.x,
                y: box.y + scroll.y,
                width: Math.min(box.width, 1366),
                height: Math.min(box.height, MAX_SCREENSHOT_HEIGHT),
              },
            })
          );
        }
      }

      if (target.watchText && matchFound) {
        // Bring the matched text into view, so the picture shows it.
        await page.evaluate((phrase: string) => {
          const candidates = Array.from(document.body.querySelectorAll('*')).reverse();
          const hit = candidates.find((element) =>
            (element.textContent ?? '')
              .replace(/\s+/g, ' ')
              .toLocaleLowerCase()
              .includes(phrase)
          );
          hit?.scrollIntoView({ block: 'center' });
        }, normalizeText(target.watchText).toLocaleLowerCase());
      } else {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
      }

      return await this.screenshotViewport(page);
    } catch (error: unknown) {
      logger.debug(error);
      return undefined;
    }
  }

  private async screenshotViewport(page: Page): Promise<Buffer | undefined> {
    try {
      return Buffer.from(await page.screenshot({ type: 'jpeg', quality: 75 }));
    } catch (error: unknown) {
      logger.debug(error);
      return undefined;
    }
  }
}
