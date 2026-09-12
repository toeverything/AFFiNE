export function spaceRoom(spaceType: string, spaceId: string): string {
  return `space:${spaceType}:${spaceId}`;
}

export function docRoom(
  spaceType: string,
  spaceId: string,
  docId: string
): string {
  return `space:${spaceType}:${spaceId}:${docId}`;
}

export function realtimeRoom(topic: string, inputKey: string): string {
  return `rt:${topic}:${inputKey}`;
}

export function realtimeInputKey(input: unknown): string {
  if (
    input === undefined ||
    typeof input === 'function' ||
    typeof input === 'symbol'
  ) {
    return 'null';
  }
  if (input === null || typeof input !== 'object') {
    return JSON.stringify(input);
  }
  if (Array.isArray(input)) {
    return `[${input.map(realtimeInputKey).join(',')}]`;
  }
  if (input instanceof Date) {
    return JSON.stringify(input.toJSON());
  }
  const record = input as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter(key => {
      const property = record[key];
      return (
        property !== undefined &&
        typeof property !== 'function' &&
        typeof property !== 'symbol'
      );
    })
    .sort()
    .map(key => `${JSON.stringify(key)}:${realtimeInputKey(record[key])}`)
    .join(',')}}`;
}

export const JOIN_BATCH_LIMIT = 100;
