import DOMPurify from 'dompurify';
import { unsafeHTML as unsafeLitHtml } from 'lit/directives/unsafe-html.js';

type SanitizeOptions = Parameters<typeof DOMPurify.sanitize>[1];

export function sanitizeHTML(html: string, options?: SanitizeOptions): string {
  return DOMPurify.sanitize(html, options);
}

export function unsafeHTML(html: string, options?: SanitizeOptions) {
  return unsafeLitHtml(sanitizeHTML(html, options));
}
