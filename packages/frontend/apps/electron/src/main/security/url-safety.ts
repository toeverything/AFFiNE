import * as dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_IPS = new BlockList();
const ALLOWED_IPV6 = new BlockList();

function stripZoneId(address: string) {
  const idx = address.indexOf('%');
  return idx === -1 ? address : address.slice(0, idx);
}

// Use Node's built-in BlockList (Electron 39 ships with Node 22.x).
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10], // CGNAT
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (includes broadcast)
] as const) {
  BLOCKED_IPS.addSubnet(network, prefix, 'ipv4');
}

BLOCKED_IPS.addAddress('::', 'ipv6');
BLOCKED_IPS.addAddress('::1', 'ipv6');
BLOCKED_IPS.addSubnet('ff00::', 8, 'ipv6'); // multicast
BLOCKED_IPS.addSubnet('fc00::', 7, 'ipv6'); // unique local
BLOCKED_IPS.addSubnet('fe80::', 10, 'ipv6'); // link-local
ALLOWED_IPV6.addSubnet('2000::', 3, 'ipv6'); // global unicast

function extractEmbeddedIPv4FromIPv6(address: string): string | null {
  if (!address.includes('.')) {
    return null;
  }
  const idx = address.lastIndexOf(':');
  if (idx === -1) {
    return null;
  }
  const tail = address.slice(idx + 1);
  return isIP(tail) === 4 ? tail : null;
}

function isBlockedIpAddress(address: string): boolean {
  const ip = stripZoneId(address);
  const family = isIP(ip);
  if (family === 4) {
    return BLOCKED_IPS.check(ip, 'ipv4');
  }
  if (family === 6) {
    const embeddedV4 = extractEmbeddedIPv4FromIPv6(ip);
    if (embeddedV4) {
      return isBlockedIpAddress(embeddedV4);
    }
    if (!ALLOWED_IPV6.check(ip, 'ipv6')) {
      return true;
    }
    return BLOCKED_IPS.check(ip, 'ipv6');
  }
  return true;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const lowered = hostname.toLowerCase();
  if (lowered === 'localhost' || lowered.endsWith('.localhost')) {
    return ['127.0.0.1', '::1'];
  }

  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map(r => r.address);
}

export async function resolveAndValidateUrlForPreview(
  rawUrl: string
): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error('Disallowed URL protocol');
  }

  if (url.username || url.password) {
    throw new Error('URL must not include credentials');
  }

  if (!url.hostname) {
    throw new Error('Missing hostname');
  }

  if (isIP(url.hostname)) {
    if (isBlockedIpAddress(url.hostname)) {
      throw new Error('Blocked IP address');
    }
    return { url, address: url.hostname };
  }

  const addresses = await resolveHostAddresses(url.hostname);
  if (!addresses.length) {
    throw new Error('Unresolvable hostname');
  }

  for (const addr of addresses) {
    if (isBlockedIpAddress(addr)) {
      throw new Error('Blocked IP address');
    }
  }

  return { url, address: addresses[0] };
}
