// Plain-text (http:, ws:) traffic is only allowed to hosts on the local
// network, matching iOS NSAllowsLocalNetworking: unqualified names, `.local`
// names, and loopback, private and link-local IP literals. Names are never
// resolved, so a public-looking name is rejected even if it points to a
// private address. The Android app enforces the same rules natively in
// `LocalNetwork.kt`; both are tested against `fixtures/hosts.json`.

const IPV4_LIKE_LABEL = /^(?:0x[0-9a-f]*|\d+)$/;
const IPV4_LITERAL = /^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/;

function isLocalIPv4(address: string) {
  if (!IPV4_LITERAL.test(address)) {
    return false;
  }
  const octets = address.split('.').map(Number);
  if (octets.some(octet => octet > 255)) {
    return false;
  }
  const [a, b] = octets;
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

function parseIPv6(address: string): number[] | null {
  const halves = address.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return null;
  }
  const groups = [
    ...head,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => '0'),
    ...tail,
  ];
  if (!groups.every(group => IPV6_GROUP.test(group))) {
    return null;
  }
  return groups.map(group => parseInt(group, 16));
}

function isLocalIPv6(address: string) {
  const groups = parseIPv6(address.replace(/%.*$/, ''));
  if (!groups) {
    return false;
  }
  const isLoopback = groups.slice(0, 7).every(g => g === 0) && groups[7] === 1;
  return (
    isLoopback ||
    (groups[0] & 0xfe00) === 0xfc00 ||
    (groups[0] & 0xffc0) === 0xfe80
  );
}

export function isLocalNetworkHost(host: string) {
  const name = host
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.$/, '');
  if (name.includes(':')) {
    return isLocalIPv6(name);
  }
  const labels = name.split('.');
  if (labels.some(label => label.length === 0)) {
    return false;
  }
  if (IPV4_LIKE_LABEL.test(labels[labels.length - 1])) {
    return isLocalIPv4(name);
  }
  return labels.length === 1 || labels[labels.length - 1] === 'local';
}

export function isBlockedCleartextUrl(url: URL) {
  return (
    (url.protocol === 'http:' || url.protocol === 'ws:') &&
    !isLocalNetworkHost(url.hostname)
  );
}
