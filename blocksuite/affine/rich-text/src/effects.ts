import { RichText } from './rich-text.js';

export function effects() {
  customElements.define('rich-text', RichText);
}

declare global {
  interface HTMLElementTagNameMap {
    'rich-text': RichText;
  }
}
