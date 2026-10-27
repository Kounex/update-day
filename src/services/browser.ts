import { inject, injectable } from 'inversify';
import puppeteer, { Browser, Page } from 'puppeteer';
import Config from '../config.js';
import { TYPES } from '../types.js';
import logger from '../utils/logger.js';
import Semaphore from '../utils/semaphore.js';

// Restart Chrome now and then - long-running headless Chrome slowly grows
// in memory, and a fresh process also clears anything that got wedged.
const RECYCLE_AFTER_PAGES = 200;

export class DeadlineError extends Error {
  constructor(ms: number) {
    super(`Scrape exceeded its ${ms} ms deadline`);
    this.name = 'DeadlineError';
  }
}

export interface BrowserStatus {
  connected: boolean;
  launchedAtMS: number | null;
  pagesSinceLaunch: number;
  totalPages: number;
  active: number;
  queued: number;
  lastLaunchError: string | null;
}

// One shared Chrome for every scrape instead of a whole browser process per
// check: each scrape gets its own incognito-like context (no shared cookies
// or storage), and at most SCRAPE_CONCURRENCY of them run at once - after a
// restart, every overdue Observe is queued instead of all launching Chrome
// simultaneously.
@injectable()
export default class BrowserService {
  private browser?: Browser;
  private launching?: Promise<Browser>;
  private launchedAtMS: number | null = null;
  private pagesSinceLaunch = 0;
  private totalPages = 0;
  private lastLaunchError: string | null = null;
  private readonly limiter: Semaphore;

  constructor(
    @inject(TYPES.Config)
    private readonly config: Pick<Config, 'CHROME_SANDBOX' | 'SCRAPE_CONCURRENCY'>
  ) {
    this.limiter = new Semaphore(config.SCRAPE_CONCURRENCY);
  }

  public async withPage<T>(
    task: (page: Page) => Promise<T>,
    options: { deadlineMS: number }
  ): Promise<T> {
    return this.limiter.run(async () => {
      const browser = await this.getBrowser();
      const context = await browser.createBrowserContext();
      this.pagesSinceLaunch++;
      this.totalPages++;

      let timer: NodeJS.Timeout | undefined;
      try {
        const page = await context.newPage();
        // A page that hangs (stuck navigation, endless script) must not
        // block its slot forever - closing the context in `finally` makes
        // whatever the task is still awaiting reject.
        return await Promise.race([
          task(page),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new DeadlineError(options.deadlineMS));
            }, options.deadlineMS);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        await context.close().catch((error: unknown) => {
          logger.debug(error);
        });
        await this.recycleIfDue();
      }
    });
  }

  public status(): BrowserStatus {
    return {
      connected: this.browser?.connected ?? false,
      launchedAtMS: this.launchedAtMS,
      pagesSinceLaunch: this.pagesSinceLaunch,
      totalPages: this.totalPages,
      active: this.limiter.active,
      queued: this.limiter.queued,
      lastLaunchError: this.lastLaunchError,
    };
  }

  public async close(): Promise<void> {
    const { browser } = this;
    this.browser = undefined;
    await browser?.close().catch((error: unknown) => {
      logger.debug(error);
    });
  }

  private async getBrowser(): Promise<Browser> {
    if (this.browser?.connected) {
      return this.browser;
    }

    this.launching ??= this.launch().finally(() => {
      this.launching = undefined;
    });
    return this.launching;
  }

  private async launch(): Promise<Browser> {
    const args = [
      // Docker gives /dev/shm only 64 MB; Chrome crashes ("Aw, Snap") on
      // bigger pages when it's used for shared memory.
      '--disable-dev-shm-usage',
    ];
    if (!this.config.CHROME_SANDBOX) {
      // The container (non-root, unprivileged) is the isolation boundary
      // then - see README, "Chrome sandbox".
      args.push('--no-sandbox');
    }

    try {
      const browser = await puppeteer.launch({ args });
      this.lastLaunchError = null;
      this.launchedAtMS = Date.now();
      this.pagesSinceLaunch = 0;
      browser.on('disconnected', () => {
        if (this.browser === browser) {
          logger.warn('Chrome disconnected, will relaunch on the next scrape');
          this.browser = undefined;
        }
      });
      this.browser = browser;
      logger.info(`Chrome started (${await browser.version()})`);
      return browser;
    } catch (error: unknown) {
      this.lastLaunchError =
        error instanceof Error ? error.message : String(error);
      logger.error('Could not start Chrome', error);
      throw error;
    }
  }

  private async recycleIfDue(): Promise<void> {
    if (
      this.pagesSinceLaunch >= RECYCLE_AFTER_PAGES &&
      this.limiter.active <= 1 &&
      this.limiter.queued === 0
    ) {
      logger.info(`Recycling Chrome after ${this.pagesSinceLaunch} pages`);
      await this.close();
    }
  }
}
