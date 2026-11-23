import { AffineFootnoteNode } from './footnote-node/footnote-node';
import { FootNotePopup } from './footnote-node/footnote-popup';
import { FootNotePopupChip } from './footnote-node/footnote-popup-chip';

export function effects() {
  customElements.define('affine-footnote-node', AffineFootnoteNode);
  customElements.define('footnote-popup', FootNotePopup);
  customElements.define('footnote-popup-chip', FootNotePopupChip);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-footnote-node': AffineFootnoteNode;
    'footnote-popup': FootNotePopup;
    'footnote-popup-chip': FootNotePopupChip;
  }
}
