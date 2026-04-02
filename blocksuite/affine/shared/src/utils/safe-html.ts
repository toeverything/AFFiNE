import DOMPurify from 'dompurify';
import { unsafeHTML as unsafeLitHtml } from 'lit/directives/unsafe-html.js';

type DOMPurifyOptions = NonNullable<Parameters<typeof DOMPurify.sanitize>[1]>;

type SanitizeOptions = Omit<
  DOMPurifyOptions,
  'IN_PLACE' | 'RETURN_DOM' | 'RETURN_DOM_FRAGMENT' | 'RETURN_TRUSTED_TYPE'
> & {
  IN_PLACE?: false | undefined;
  RETURN_DOM?: false | undefined;
  RETURN_DOM_FRAGMENT?: false | undefined;
  RETURN_TRUSTED_TYPE?: false | undefined;
};

export function sanitizeHTML(html: string, options?: SanitizeOptions): string {
  return DOMPurify.sanitize(html, options);
}

export function unsafeHTML(html: string, options?: SanitizeOptions) {
  return unsafeLitHtml(sanitizeHTML(html, options));
}
