import { LatexEditorMenu } from './latex-node/latex-editor-menu';
import { LatexEditorUnit } from './latex-node/latex-editor-unit';
import { AffineLatexNode } from './latex-node/latex-node';

export function effects() {
  customElements.define('latex-editor-menu', LatexEditorMenu);
  customElements.define('latex-editor-unit', LatexEditorUnit);
  customElements.define('affine-latex-node', AffineLatexNode);
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-latex-node': AffineLatexNode;
    'latex-editor-unit': LatexEditorUnit;
    'latex-editor-menu': LatexEditorMenu;
  }
}
