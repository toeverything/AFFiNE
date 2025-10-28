import { InlineComment } from './inline-comment';

export function effects() {
  customElements.define('inline-comment', InlineComment);
}

declare global {
  interface HTMLElementTagNameMap {
    'inline-comment': InlineComment;
  }
}
