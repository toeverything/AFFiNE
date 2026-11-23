import { SeniorToolExtension } from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

export const noteSeniorTool = SeniorToolExtension('note', ({ block }) => {
  return {
    name: 'Note',
    content: html`<edgeless-note-senior-button
      .edgeless=${block}
    ></edgeless-note-senior-button>`,
  };
});
