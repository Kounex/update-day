import { lookup } from 'dns/promises';
import { BlockList, isIP } from 'net';

// Anyone who can run /observe picks the URL our headless Chrome opens, from
// inside the network the bot runs in. Without this, `http://192.168.1.1/` or
// `http://localhost:9000/api` would be scraped like any shop page - and the
// "text found / not found" reply leaks what's on internal pages.
const blocked = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT / Tailscale
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private, Docker networks
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv4');
}

for (const [network, prefix] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blocked.addSubnet(network, prefix, 'ipv6');
}

export const isBlockedAddress = (address: string): boolean => {
  // Strip a zone id (fe80::1%eth0) - BlockList doesn't take it.
  const plain = address.replace(/%.*$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(plain);
  if (mapped) {
    return blocked.check(mapped[1], 'ipv4');
  }

  switch (isIP(plain)) {
    case 4: {
      return blocked.check(plain, 'ipv4');
    }

    case 6: {
      return blocked.check(plain, 'ipv6');
    }

    default: {
      // Not an address at all - refuse rather than guess.
      return true;
    }
  }
};

export class BlockedUrlError extends Error {
  constructor(public readonly url: string, reason: string) {
    super(`${reason}: ${url}`);
    this.name = 'BlockedUrlError';
  }
}

type Resolver = (hostname: string) => Promise<string[]>;

const dnsResolver: Resolver = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map(
    (entry) => entry.address
  );

export interface NetworkGuardOptions {
  allowPrivateNetwork: boolean;
  // `host:port` pairs that are always allowed - only used by the smoke test,
  // whose fixture server necessarily lives on loopback.
  allowedHosts?: string[];
  resolver?: Resolver;
}

export class NetworkGuard {
  private readonly cache = new Map<
    string,
    { allowed: boolean; expiresAt: number }
  >();

  private readonly resolver: Resolver;

  constructor(private readonly options: NetworkGuardOptions) {
    this.resolver = options.resolver ?? dnsResolver;
  }

  // Throws a BlockedUrlError for anything the bot must not open.
  public async check(rawUrl: string): Promise<void> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BlockedUrlError(rawUrl, 'Not a valid URL');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BlockedUrlError(rawUrl, `Protocol ${url.protocol} not allowed`);
    }

    if (
      this.options.allowPrivateNetwork ||
      this.options.allowedHosts?.includes(url.host)
    ) {
      return;
    }

    // URL keeps IPv6 literals bracketed.
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (!(await this.isAllowedHost(hostname))) {
      throw new BlockedUrlError(rawUrl, 'Private or local address not allowed');
    }
  }

  public async isAllowed(rawUrl: string): Promise<boolean> {
    try {
      await this.check(rawUrl);
      return true;
    } catch {
      return false;
    }
  }

  private async isAllowedHost(hostname: string): Promise<boolean> {
    if (isIP(hostname)) {
      return !isBlockedAddress(hostname);
    }

    const cached = this.cache.get(hostname);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.allowed;
    }

    let allowed: boolean;
    try {
      const addresses = await this.resolver(hostname);
      // Every address has to be public - otherwise Chrome could just as
      // well connect to the private one.
      allowed =
        addresses.length > 0 &&
        addresses.every((address) => !isBlockedAddress(address));
    } catch {
      // Unresolvable: let Chrome fail on it normally (it'll be a regular
      // navigation error), there's nothing private to reach.
      allowed = true;
    }

    if (this.cache.size > 1000) {
      this.cache.clear();
    }

    this.cache.set(hostname, { allowed, expiresAt: Date.now() + 60_000 });
    return allowed;
  }
}
