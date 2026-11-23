import {
  AFFINE_EDGELESS_AUTO_CONNECT_WIDGET,
  EdgelessAutoConnectWidget,
} from '.';

export function effects() {
  customElements.define(
    AFFINE_EDGELESS_AUTO_CONNECT_WIDGET,
    EdgelessAutoConnectWidget
  );
}
