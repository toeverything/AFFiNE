import { Injectable } from '@nestjs/common';

import { Config } from '../../../../base';
import { fetchRemoteAttachment } from '../../../../native';

type FetchRemoteAttachmentOptions = {
  signal?: AbortSignal;
  maxBytes: number;
  trustedHostSuffixes?: string[];
  detectMimeType?: (buffer: Buffer, headerMimeType: string) => string;
};

function normalizeMimeType(mediaType?: string) {
  return mediaType?.split(';', 1)[0]?.trim() || 'application/octet-stream';
}

export function resolveAttachmentFetchUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'gs:') {
    return parsed;
  }

  if (!parsed.hostname) {
    throw new Error('Invalid gs attachment URL: missing bucket');
  }

  return new URL(
    `https://storage.googleapis.com/${parsed.hostname}${parsed.pathname}${parsed.search}`
  );
}

@Injectable()
export class AttachmentMaterializer {
  constructor(private readonly config: Config) {}

  private buildFetchOptions(url: URL, trustedHostSuffixes: string[]) {
    const baseOptions = {
      timeoutMs: 15_000,
      allowPrivateTargetOrigin: false,
    };
    if (!env.prod) {
      return { ...baseOptions, allowPrivateTargetOrigin: true };
    }

    const trustedOrigins = new Set<string>();
    const protocol = this.config.server.https ? 'https:' : 'http:';
    const port = this.config.server.port;
    const isDefaultPort =
      (protocol === 'https:' && port === 443) ||
      (protocol === 'http:' && port === 80);

    const addHostOrigin = (host: string) => {
      if (!host) return;
      try {
        const parsed = new URL(`${protocol}//${host}`);
        if (!parsed.port && !isDefaultPort) {
          parsed.port = String(port);
        }
        trustedOrigins.add(parsed.origin);
      } catch {
        return;
      }
    };

    if (this.config.server.externalUrl) {
      try {
        trustedOrigins.add(new URL(this.config.server.externalUrl).origin);
      } catch {
        // ignore invalid external URL
      }
    }

    addHostOrigin(this.config.server.host);
    for (const host of this.config.server.hosts) {
      addHostOrigin(host);
    }

    const hostname = url.hostname.toLowerCase();
    const trustedByHost = trustedHostSuffixes.some(
      suffix => hostname === suffix || hostname.endsWith(`.${suffix}`)
    );
    if (trustedOrigins.has(url.origin) || trustedByHost) {
      return { ...baseOptions, allowPrivateTargetOrigin: true };
    }

    return baseOptions;
  }

  async fetchRemoteAttachment(
    url: string,
    options: FetchRemoteAttachmentOptions
  ) {
    const parsed = resolveAttachmentFetchUrl(url);
    options.signal?.throwIfAborted();
    const response = await fetchRemoteAttachment({
      url: parsed.toString(),
      ...this.buildFetchOptions(parsed, options.trustedHostSuffixes ?? []),
      maxBytes: options.maxBytes,
    });
    options.signal?.throwIfAborted();

    return {
      data: response.body.toString('base64'),
      mimeType: options.detectMimeType
        ? options.detectMimeType(
            response.body,
            normalizeMimeType(response.mimeType)
          )
        : normalizeMimeType(response.mimeType),
    };
  }
}
