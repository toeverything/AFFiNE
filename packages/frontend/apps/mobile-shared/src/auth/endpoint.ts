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

export function shouldRefreshAccessToken(code: unknown) {
  return code === 'ACCESS_TOKEN_EXPIRED' || code === 'ACCESS_TOKEN_INVALID';
}
