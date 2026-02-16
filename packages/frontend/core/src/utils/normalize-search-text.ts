interface NormalizeSearchTextOptions {
  fallback?: string;
  arrayJoiner?: string;
}

function tryParseSerializedText(value: string): unknown | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  // Indexer/storage may serialize text arrays as JSON strings like ["foo"].
  if (!trimmed.startsWith('[') && !trimmed.startsWith('"')) {
    return null;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

export function normalizeSearchText(
  value: unknown,
  { fallback = '', arrayJoiner = ' ' }: NormalizeSearchTextOptions = {}
): string {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map(item =>
        normalizeSearchText(item, {
          fallback: '',
          arrayJoiner,
        })
      )
      .filter(Boolean);

    return normalized.length > 0 ? normalized.join(arrayJoiner) : fallback;
  }

  if (typeof value !== 'string') {
    return String(value);
  }

  const parsed = tryParseSerializedText(value);
  if (parsed === null) {
    return value;
  }

  if (typeof parsed === 'string' || Array.isArray(parsed)) {
    return normalizeSearchText(parsed, {
      fallback,
      arrayJoiner,
    });
  }

  return value;
}
