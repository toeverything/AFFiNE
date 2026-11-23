import { EdgelessConnectorHandle } from './components/connector-handle';
import { EdgelessConnectorLabelEditor } from './text/edgeless-connector-label-editor';
import { EdgelessConnectorMenu } from './toolbar/connector-menu';
import { EdgelessConnectorToolButton } from './toolbar/connector-tool-button';

export function effects() {
  customElements.define(
    'edgeless-connector-tool-button',
    EdgelessConnectorToolButton
  );
  customElements.define('edgeless-connector-menu', EdgelessConnectorMenu);
  customElements.define(
    'edgeless-connector-label-editor',
    EdgelessConnectorLabelEditor
  );
  customElements.define('edgeless-connector-handle', EdgelessConnectorHandle);
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-connector-tool-button': EdgelessConnectorToolButton;
    'edgeless-connector-menu': EdgelessConnectorMenu;
    'edgeless-connector-label-editor': EdgelessConnectorLabelEditor;
    'edgeless-connector-handle': EdgelessConnectorHandle;
  }
}
