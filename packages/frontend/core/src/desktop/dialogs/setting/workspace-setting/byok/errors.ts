export function logByokError(context: string, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Unknown BYOK error';
  console.warn(
    `${context}: ${message
      .replaceAll(/sk-[a-zA-Z0-9_-]+/g, 'sk-***')
      .replaceAll(/Bearer\s+[a-zA-Z0-9._-]+/gi, 'Bearer ***')
      .replaceAll(/Key\s+[a-zA-Z0-9._:-]+/gi, 'Key ***')
      .replaceAll(/([?&]key=)[^&\s]+/gi, '$1***')
      .replaceAll(/("apiKey"\s*:\s*")[^"]+/gi, '$1***')
      .slice(0, 300)}`
  );
}
