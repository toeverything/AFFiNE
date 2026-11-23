import { AdapterPanel, AFFINE_ADAPTER_PANEL } from './adapter-panel';
import {
  AdapterPanelBody,
  AFFINE_ADAPTER_PANEL_BODY,
} from './body/adapter-panel-body';
import { AdapterMenu, AFFINE_ADAPTER_MENU } from './header/adapter-menu';
import {
  AdapterPanelHeader,
  AFFINE_ADAPTER_PANEL_HEADER,
} from './header/adapter-panel-header';

export function effects() {
  customElements.define(AFFINE_ADAPTER_PANEL, AdapterPanel);
  customElements.define(AFFINE_ADAPTER_MENU, AdapterMenu);
  customElements.define(AFFINE_ADAPTER_PANEL_HEADER, AdapterPanelHeader);
  customElements.define(AFFINE_ADAPTER_PANEL_BODY, AdapterPanelBody);
}
