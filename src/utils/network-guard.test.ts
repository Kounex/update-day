import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isBlockedAddress, NetworkGuard } from './network-guard.js';

describe('isBlockedAddress', () => {
  it('blocks loopback, private, link-local and CGNAT ranges', () => {
    for (const address of [
      '127.0.0.1',
      '10.1.2.3',
      '172.17.0.1',
      '192.168.1.10',
      '169.254.169.254',
      '100.100.1.1',
      '0.0.0.0',
      '::1',
      '::',
      'fd12:3456::1',
      'fe80::1',
      'fe80::1%eth0',
      '::ffff:127.0.0.1',
      '::ffff:192.168.0.1',
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  it('allows public addresses', () => {
    for (const address of [
      '1.1.1.1',
      '93.184.216.34',
      '172.32.0.1',
      '2606:4700:4700::1111',
      '::ffff:8.8.8.8',
    ]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  it('refuses anything that is not an address', () => {
    assert.equal(isBlockedAddress('example.com'), true);
  });
});

describe('NetworkGuard', () => {
  const resolver = async (hostname: string) =>
    ({
      'public.test': ['93.184.216.34'],
      'internal.test': ['192.168.1.20'],
      'mixed.test': ['93.184.216.34', '10.0.0.5'],
    })[hostname] ?? [];

  const guard = new NetworkGuard({ allowPrivateNetwork: false, resolver });

  it('allows public hosts and IP literals', async () => {
    assert.equal(await guard.isAllowed('https://public.test/a'), true);
    assert.equal(await guard.isAllowed('http://1.1.1.1/'), true);
  });

  it('blocks private hosts, IP literals and IPv6 literals', async () => {
    assert.equal(await guard.isAllowed('http://internal.test/'), false);
    assert.equal(await guard.isAllowed('http://127.0.0.1:9000/api'), false);
    assert.equal(await guard.isAllowed('http://[::1]/'), false);
    assert.equal(await guard.isAllowed('http://localhost/'), false);
  });

  it('blocks a host if any of its addresses is private', async () => {
    assert.equal(await guard.isAllowed('https://mixed.test/'), false);
  });

  it('blocks non-http protocols', async () => {
    assert.equal(await guard.isAllowed('file:///etc/passwd'), false);
    assert.equal(await guard.isAllowed('ftp://public.test/'), false);
  });

  it('honors allowPrivateNetwork and allowedHosts', async () => {
    const open = new NetworkGuard({ allowPrivateNetwork: true, resolver });
    assert.equal(await open.isAllowed('http://192.168.1.1/'), true);

    const fixture = new NetworkGuard({
      allowPrivateNetwork: false,
      allowedHosts: ['127.0.0.1:4000'],
      resolver,
    });
    assert.equal(await fixture.isAllowed('http://127.0.0.1:4000/x'), true);
    assert.equal(await fixture.isAllowed('http://127.0.0.1:4001/x'), false);
  });
});
