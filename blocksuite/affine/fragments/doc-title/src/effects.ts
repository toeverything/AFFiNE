import { DocTitle } from './doc-title';

export function effects() {
  customElements.define('doc-title', DocTitle);
}

declare global {
  interface HTMLElementTagNameMap {
    'doc-title': DocTitle;
  }
}
