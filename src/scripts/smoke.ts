// End-to-end check of the scraper with a real Chrome against local pages:
// the thing a passing build never proved (the 0.11.1 sandbox crash made
// every single scrape fail while the image built and booted just fine).
// Runs in CI inside the built image, before anything gets released:
//   node dist/scripts/smoke.js      (or: npx tsx src/scripts/smoke.ts)
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import BrowserService from '../services/browser.js';
import ScrapeService, { ScrapeTarget } from '../services/scrape.js';
import { ScrapeFailure, ScrapeResult } from '../types/classes/scrape-result.js';
import { WatchMode } from '../types/models/observe.js';
import { NetworkGuard } from '../utils/network-guard.js';

const page = (body: string, title = 'Shop') =>
  `<!doctype html><html><head><title>${title}</title><link rel="icon" href="/favicon.png"></head><body>${body}</body></html>`;

let internalHits = 0;

const listen = async (server: Server, host: string): Promise<number> =>
  new Promise((resolve) => {
    server.listen(0, host, () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

const main = async () => {
  // Stands in for something on the LAN the bot must never reach.
  const internal = createServer((_request, response) => {
    internalHits++;
    response.end('internal secret');
  });
  const internalPort = await listen(internal, '127.0.0.1');
  const internalUrl = `http://localhost:${internalPort}/secret`;

  const routes: Record<string, (response: import('node:http').ServerResponse) => void> = {
    '/static'(response) {
      response.end(page('<main><h1>Thing</h1><p class="stock">Coming   <b>Soon</b></p></main>'));
    },
    '/late'(response) {
      response.end(
        page(
          '<main id="m"></main><script>setTimeout(() => { document.getElementById("m").innerText = "Coming soon"; }, 1500)</script>'
        )
      );
    },
    '/gone'(response) {
      response.end(page('<main><p class="stock">In stock - buy now</p></main>'));
    },
    '/price'(response) {
      response.end(page('<main><span id="price">10,00 €</span></main>'));
    },
    '/error'(response) {
      response.statusCode = 503;
      response.end(page('<p>Coming soon</p>', 'Service Unavailable'));
    },
    '/challenge'(response) {
      response.statusCode = 403;
      response.end(page('<div id="challenge-running">Checking your browser</div>', 'Just a moment...'));
    },
    '/redirect-private'(response) {
      response.statusCode = 302;
      response.setHeader('Location', internalUrl);
      response.end();
    },
    '/subresource'(response) {
      response.end(page(`<p>Coming soon</p><img src="${internalUrl}">`));
    },
    '/slow'(response) {
      setTimeout(() => response.end(page('<p>late</p>')), 10_000);
    },
  };

  const site = createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    const route = routes[new URL(request.url ?? '/', 'http://x').pathname];
    if (route) {
      route(response);
    } else {
      response.statusCode = 404;
      response.end(page('not found', 'Not Found'));
    }
  });
  const sitePort = await listen(site, '127.0.0.1');
  const base = `http://127.0.0.1:${sitePort}`;

  const browser = new BrowserService({
    CHROME_SANDBOX: process.env.CHROME_SANDBOX === 'true',
    SCRAPE_CONCURRENCY: 2,
  });
  // The fixture site has to be on loopback - allow exactly it, so the guard
  // is still live for everything else (the "internal" server included).
  const scraper = new ScrapeService(
    browser,
    { ALLOW_PRIVATE_NETWORK: false },
    new NetworkGuard({ allowPrivateNetwork: false, allowedHosts: [`127.0.0.1:${sitePort}`] })
  );

  const scrape = async (
    path: string,
    target: Partial<ScrapeTarget> = {},
    timeoutMS = 8_000
  ): Promise<ScrapeResult> =>
    scraper.scrape(
      {
        url: path.startsWith('http') ? path : `${base}${path}`,
        cssSelector: null,
        watchText: 'coming soon',
        watchMode: WatchMode.Disappears,
        ...target,
      },
      { timeoutMS, screenshot: true }
    );

  const checks: Array<[string, () => Promise<void>]> = [
    ['finds text across elements, case and whitespace', async () => {
      const result = await scrape('/static');
      assert.ok(result.ok, JSON.stringify(result));
      assert.equal(result.matchFound, true);
      assert.equal(result.httpStatus, 200);
      assert.equal(result.thumbnail, `${base}/favicon.png`);
      assert.ok(result.screenshot && result.screenshot[0] === 0xff && result.screenshot[1] === 0xd8, 'JPEG screenshot');
    }],
    ['waits for text rendered late by scripts', async () => {
      const result = await scrape('/late');
      assert.ok(result.ok);
      assert.equal(result.matchFound, true);
    }],
    ['reports missing text as absent', async () => {
      const result = await scrape('/gone');
      assert.ok(result.ok);
      assert.equal(result.matchFound, false);
    }],
    ['narrows to a selector and screenshots it', async () => {
      const result = await scrape('/price', {
        cssSelector: '#price',
        watchText: '',
        watchMode: WatchMode.Changes,
      });
      assert.ok(result.ok);
      assert.equal(result.text.trim(), '10,00 €');
      assert.equal(result.matchFound, null);
      assert.ok(result.screenshot);
    }],
    ['a selector that matches nothing is a failure, not a change', async () => {
      const result = await scrape('/static', { cssSelector: '#nope' }, 3_000);
      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.failure, ScrapeFailure.ElementNotFound);
    }],
    ['an HTTP error page is a failure, not a change', async () => {
      const result = await scrape('/error');
      assert.equal(!result.ok && result.failure, ScrapeFailure.HttpError);
      assert.equal(result.httpStatus, 503);
    }],
    ['a bot challenge page is a failure, not a change', async () => {
      const result = await scrape('/challenge');
      assert.equal(!result.ok && result.failure, ScrapeFailure.Blocked);
    }],
    ['a slow page times out', async () => {
      const result = await scrape('/slow', {}, 2_000);
      assert.equal(!result.ok && result.failure, ScrapeFailure.Timeout);
    }],
    ['private addresses are refused', async () => {
      const result = await scrape(internalUrl);
      assert.equal(!result.ok && result.failure, ScrapeFailure.NetworkBlocked);
    }],
    ['redirects to private addresses are refused', async () => {
      const result = await scrape('/redirect-private');
      assert.equal(!result.ok && result.failure, ScrapeFailure.NetworkBlocked, JSON.stringify(!result.ok && result.detail));
    }],
    ['sub-requests to private addresses are blocked', async () => {
      const result = await scrape('/subresource');
      assert.ok(result.ok);
      assert.equal(result.matchFound, true);
    }],
    ['runs scrapes in parallel through the shared browser', async () => {
      const results = await Promise.all(['/static', '/gone', '/static', '/gone'].map(async (path) => scrape(path)));
      assert.deepEqual(results.map((result) => result.ok && result.matchFound), [true, false, true, false]);
    }],
  ];

  let failed = 0;
  for (const [name, check] of checks) {
    const started = Date.now();
    try {
      // eslint-disable-next-line no-await-in-loop
      await check();
      console.log(`✔ ${name} (${Date.now() - started} ms)`);
    } catch (error: unknown) {
      failed++;
      console.log(`✖ ${name}`);
      console.log(error);
    }
  }

  if (internalHits > 0) {
    failed++;
    console.log(`✖ the internal server was reached ${internalHits} time(s)`);
  } else {
    console.log('✔ the internal server was never reached');
  }

  await browser.close();
  site.close();
  internal.close();

  console.log(failed ? `\n${failed} smoke check(s) failed` : '\nAll smoke checks passed');
  process.exit(failed ? 1 : 0);
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
