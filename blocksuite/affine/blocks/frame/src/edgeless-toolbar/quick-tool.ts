import { QuickToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

import { buildFrameDenseMenu } from './frame-dense-menu';

export const frameQuickTool = QuickToolExtension('frame', ({ block, gfx }) => {
  return {
    type: 'frame',
    content: html`<edgeless-frame-tool-button
      .edgeless=${block}
    ></edgeless-frame-tool-button>`,
    menu: buildFrameDenseMenu(block, gfx),
    enable: !block.store.readonly,
    priority: 90,
  };
});
