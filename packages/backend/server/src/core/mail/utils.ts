import { isIP } from 'node:net';
import { hostname as getHostname } from 'node:os';

const hostnameLabelRegexp = /^[A-Za-z0-9-]+$/;

function isValidSMTPAddressLiteral(hostname: string) {
  if (!hostname.startsWith('[') || !hostname.endsWith(']')) return false;

  const literal = hostname.slice(1, -1);
  if (!literal || literal.includes(' ')) return false;
  if (isIP(literal) === 4) return true;

  if (literal.startsWith('IPv6:')) {
    return isIP(literal.slice('IPv6:'.length)) === 6;
  }

  return false;
}

export function normalizeSMTPHeloHostname(hostname: string) {
  const normalized = hostname.trim().replace(/\.$/, '');
  if (!normalized) return undefined;
  if (isValidSMTPAddressLiteral(normalized)) return normalized;
  if (normalized.length > 253) return undefined;

  const labels = normalized.split('.');
  for (const label of labels) {
    if (!label || label.length > 63) return undefined;
    if (
      !hostnameLabelRegexp.test(label) ||
      label.startsWith('-') ||
      label.endsWith('-')
    ) {
      return undefined;
    }
  }

  return normalized;
}

function readSystemHostname() {
  try {
    return getHostname();
  } catch {
    return '';
  }
}

export function resolveSMTPHeloHostname(configuredName: string) {
  const normalizedConfiguredName = normalizeSMTPHeloHostname(configuredName);
  if (normalizedConfiguredName) return normalizedConfiguredName;
  return normalizeSMTPHeloHostname(readSystemHostname());
}
