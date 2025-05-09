import { EdgelessEraserToolButton } from './toolbar/components/eraser/eraser-tool-button';
import { EdgelessPenMenu } from './toolbar/components/pen/pen-menu';
import { EdgelessPenToolButton } from './toolbar/components/pen/pen-tool-button';

export function effects() {
  customElements.define(
    'edgeless-eraser-tool-button',
    EdgelessEraserToolButton
  );
  customElements.define('edgeless-pen-tool-button', EdgelessPenToolButton);
  customElements.define('edgeless-pen-menu', EdgelessPenMenu);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-pen-menu': EdgelessPenMenu;
    'edgeless-pen-tool-button': EdgelessPenToolButton;
    'edgeless-eraser-tool-button': EdgelessEraserToolButton;
  }
}
