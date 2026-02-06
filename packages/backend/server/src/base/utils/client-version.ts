const DAY_MS = 24 * 60 * 60 * 1000;

// Example: 2026.2.6-canary.015
const CANARY_DATE_VERSION_RE =
  /^v?(\d{4})\.(\d{1,2})\.(\d{1,2})-canary\.(\d+)(?:\+.*)?$/i;

export const CANARY_CLIENT_VERSION_MAX_AGE_DAYS = 62; // ~2 months
export const CANARY_CLIENT_VERSION_MAX_FUTURE_SKEW_DAYS = 2;

export type CanaryDateClientVersion = {
  raw: string;
  normalized: string;
  dateMs: number;
};

export function parseCanaryDateClientVersion(
  version: string
): CanaryDateClientVersion | null {
  const raw = version.trim();
  const match = CANARY_DATE_VERSION_RE.exec(raw);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const build = match[4].replace(/^0+(?=\d)/, '');

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 0 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const dateMs = Date.UTC(year, month - 1, day);
  const date = new Date(dateMs);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return {
    raw,
    normalized: `${year}.${month}.${day}-canary.${build}`,
    dateMs,
  };
}

export type CanaryClientVersionCheckResult =
  | { matched: false }
  | { matched: true; allowed: boolean; normalized: string };

export function checkCanaryDateClientVersion(
  version: string,
  options?: {
    nowMs?: number;
    maxAgeDays?: number;
    maxFutureSkewDays?: number;
  }
): CanaryClientVersionCheckResult {
  const parsed = parseCanaryDateClientVersion(version);
  if (!parsed) {
    return { matched: false };
  }

  const nowMs = options?.nowMs ?? Date.now();
  const maxAgeDays = options?.maxAgeDays ?? CANARY_CLIENT_VERSION_MAX_AGE_DAYS;
  const maxFutureSkewDays =
    options?.maxFutureSkewDays ?? CANARY_CLIENT_VERSION_MAX_FUTURE_SKEW_DAYS;

  const ageMs = nowMs - parsed.dateMs;
  const maxAgeMs = maxAgeDays * DAY_MS;
  const maxFutureSkewMs = maxFutureSkewDays * DAY_MS;

  return {
    matched: true,
    allowed: ageMs <= maxAgeMs && ageMs >= -maxFutureSkewMs,
    normalized: parsed.normalized,
  };
}
