import { shell } from 'electron';

const DEFAULT_ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export interface OpenExternalOptions {
  additionalProtocols?: string[];
}

export const isAllowedExternalUrl = (
  rawUrl: string,
  additionalProtocols: Iterable<string> = []
) => {
  try {
    const parsed = new URL(rawUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (DEFAULT_ALLOWED_PROTOCOLS.has(protocol)) {
      return true;
    }

    for (const extra of additionalProtocols) {
      if (protocol === extra.toLowerCase()) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.warn('[security] Failed to parse external URL', rawUrl, error);
    return false;
  }
};

export const openExternalSafely = async (
  rawUrl: string,
  options: OpenExternalOptions = {}
) => {
  const { additionalProtocols = [] } = options;

  if (!isAllowedExternalUrl(rawUrl, additionalProtocols)) {
    console.warn('[security] Blocked attempt to open external URL:', rawUrl);
    return;
  }

  try {
    await shell.openExternal(rawUrl);
  } catch (error) {
    console.error('[security] Failed to open external URL:', rawUrl, error);
  }
};
export const ALLOWED_EXTERNAL_PROTOCOLS: ReadonlySet<string> = new Set(
  DEFAULT_ALLOWED_PROTOCOLS
);
