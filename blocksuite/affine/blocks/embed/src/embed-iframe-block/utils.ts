import { EmbedIframeService } from '@blocksuite/affine-shared/services';
import type { BlockStdScope } from '@blocksuite/std';

/**
 * The options for the embed iframe url validation
 */
export interface EmbedIframeUrlValidationOptions {
  protocols: string[]; // Allowed protocols, e.g. ['https']
  hostnames: string[]; // Allowed hostnames, e.g. ['docs.google.com']
}

/**
 * Validate the url is allowed to embed in the iframe
 * @param url URL to validate
 * @param options Validation options
 * @returns Whether the url is valid
 */
export function validateEmbedIframeUrl(
  url: string,
  options: EmbedIframeUrlValidationOptions
): boolean {
  try {
    const parsedUrl = new URL(url);

    const { protocols, hostnames } = options;
    return (
      protocols.includes(parsedUrl.protocol) &&
      hostnames.includes(parsedUrl.hostname)
    );
  } catch (e) {
    console.warn(`Invalid embed iframe url: ${url}`, e);
    return false;
  }
}

/**
 * Safely extracts the src URL from an iframe HTML string
 * @param htmlString The iframe HTML string to parse
 * @param options Optional validation configuration
 * @returns The validated src URL or undefined if validation fails
 */
export function safeGetIframeSrc(htmlString: string): string | undefined {
  try {
    // Create a DOMParser instance
    const parser = new DOMParser();
    // Parse the HTML string
    const doc = parser.parseFromString(htmlString, 'text/html');
    // Get the iframe element
    const iframe = doc.querySelector('iframe');
    if (!iframe) {
      return undefined;
    }

    // Get the src attribute
    const src = iframe.getAttribute('src');
    if (!src) {
      return undefined;
    }

    return src;
  } catch {
    return undefined;
  }
}

/**
 * Check if the url can be embedded as an iframe
 * @param std The block std scope
 * @param url The url to check
 * @returns Whether the url can be embedded as an iframe
 */
export function canEmbedAsIframe(std: BlockStdScope, url: string) {
  const embedIframeService = std.get(EmbedIframeService);
  return embedIframeService.canEmbed(url);
}
