function errorMetadata(error: unknown) {
  if (!error || typeof error !== 'object') {
    return { kind: typeof error };
  }
  const record = error as Record<string, unknown>;
  return {
    name: typeof record.name === 'string' ? record.name : undefined,
    code: typeof record.code === 'string' ? record.code : undefined,
    status:
      typeof record.status === 'number' || typeof record.status === 'string'
        ? record.status
        : undefined,
    type: typeof record.type === 'string' ? record.type : undefined,
  };
}

export function logByokError(context: string, error: unknown) {
  console.warn(context, errorMetadata(error));
}
