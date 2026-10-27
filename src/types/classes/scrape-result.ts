export enum ScrapeFailure {
  // Navigation or waiting ran out of time
  Timeout = 'Timeout',
  // DNS failure, connection refused/reset, TLS error, ...
  Unreachable = 'Unreachable',
  // The server answered, but with 4xx/5xx
  HttpError = 'HttpError',
  // Bot protection / challenge page instead of the real content
  Blocked = 'Blocked',
  // The CSS selector matched nothing
  ElementNotFound = 'ElementNotFound',
  // Refused by the network guard (private/local address)
  NetworkBlocked = 'NetworkBlocked',
  // Chrome itself failed (crash, launch error, ...)
  BrowserError = 'BrowserError',
}

interface ScrapeResultBase {
  httpStatus: number | null;
  durationMS: number;
  finalUrl: string;
  title: string;
  screenshot?: Buffer;
}

export interface ScrapeSuccess extends ScrapeResultBase {
  ok: true;
  // Visible text of the selector's element (or the whole page)
  text: string;
  // Whether the watched text was found - null when there's no watched text
  matchFound: boolean | null;
  thumbnail: string | null;
}

export interface ScrapeError extends ScrapeResultBase {
  ok: false;
  failure: ScrapeFailure;
  detail: string;
}

export type ScrapeResult = ScrapeSuccess | ScrapeError;

export const failureText = (
  failure: ScrapeFailure,
  options: { cssSelector?: string | null; httpStatus?: number | null } = {}
): string => {
  switch (failure) {
    case ScrapeFailure.Timeout: {
      return 'the page took too long to load';
    }

    case ScrapeFailure.Unreachable: {
      return 'the site could not be reached';
    }

    case ScrapeFailure.HttpError: {
      return `the site answered with an error (HTTP ${options.httpStatus ?? '?'})`;
    }

    case ScrapeFailure.Blocked: {
      return 'the site showed a bot check / challenge page instead of its content';
    }

    case ScrapeFailure.ElementNotFound: {
      return `nothing on the page matched the CSS selector \`${options.cssSelector ?? ''}\``;
    }

    case ScrapeFailure.NetworkBlocked: {
      return 'the address points to a private or local network, which this bot is not allowed to open';
    }

    case ScrapeFailure.BrowserError: {
      return 'the browser ran into an internal error';
    }
  }
};
