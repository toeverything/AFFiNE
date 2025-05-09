import { DocTitle } from './doc-title';

export * from './doc-title';

export function effects() {
  customElements.define('affine-linked-doc-title', DocTitle);
}
