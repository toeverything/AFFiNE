import { EdgelessBrushMenu } from './toolbar/components/brush/brush-menu';
import { EdgelessBrushToolButton } from './toolbar/components/brush/brush-tool-button';
import { EdgelessEraserToolButton } from './toolbar/components/eraser/eraser-tool-button';

export function effects() {
  customElements.define('edgeless-brush-tool-button', EdgelessBrushToolButton);
  customElements.define('edgeless-brush-menu', EdgelessBrushMenu);
  customElements.define(
    'edgeless-eraser-tool-button',
    EdgelessEraserToolButton
  );
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-brush-tool-button': EdgelessBrushToolButton;
    'edgeless-brush-menu': EdgelessBrushMenu;
    'edgeless-eraser-tool-button': EdgelessEraserToolButton;
  }
}
