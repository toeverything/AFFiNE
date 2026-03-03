import { hostname as getHostname } from 'node:os';

const hostnameLabelRegexp = /^[A-Za-z0-9-]+$/;
const addressLiteralRegexp = /^\[[^\]\s]+\]$/;

export function normalizeSMTPHeloHostname(hostname: string) {
  const normalized = hostname.trim().replace(/\.$/, '');
  if (!normalized) return undefined;
  if (addressLiteralRegexp.test(normalized)) return normalized;
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

export function resolveSMTPHeloHostname(
  configuredName: string,
  systemHostname?: string
) {
  const normalizedConfiguredName = normalizeSMTPHeloHostname(configuredName);
  if (normalizedConfiguredName) return normalizedConfiguredName;
  if (configuredName.trim()) return undefined;
  return normalizeSMTPHeloHostname(systemHostname ?? readSystemHostname());
}
