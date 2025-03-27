import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

export const penSeniorTool = SeniorToolExtension('pen', ({ block }) => {
  return {
    name: 'Pen',
    content: html`<div class="brush-and-eraser">
      <edgeless-brush-tool-button
        .edgeless=${block}
      ></edgeless-brush-tool-button>

      <edgeless-eraser-tool-button
        .edgeless=${block}
      ></edgeless-eraser-tool-button>
    </div> `,
  };
});
