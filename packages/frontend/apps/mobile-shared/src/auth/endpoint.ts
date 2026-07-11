export function canonicalAuthEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : endpoint;
  } catch {
    return endpoint;
  }
}
