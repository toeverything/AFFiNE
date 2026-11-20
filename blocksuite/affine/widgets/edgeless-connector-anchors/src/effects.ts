import { EdgelessConnectorAnchorsWidget } from './index.js';

export function effects() {
  if (!customElements.get('affine-edgeless-connector-anchors-widget')) {
    customElements.define(
      'affine-edgeless-connector-anchors-widget',
      EdgelessConnectorAnchorsWidget
    );
  }
}
