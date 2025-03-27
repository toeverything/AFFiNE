import { frameQuickTool } from '@blocksuite/affine-block-frame';
import { penSeniorTool } from '@blocksuite/affine-gfx-brush';
import { connectorQuickTool } from '@blocksuite/affine-gfx-connector';
import { mindMapSeniorTool } from '@blocksuite/affine-gfx-mindmap';
import { noteSeniorTool } from '@blocksuite/affine-gfx-note';
import { shapeSeniorTool } from '@blocksuite/affine-gfx-shape';
import {
  QuickToolExtension,
  SeniorToolExtension,
} from '@blocksuite/affine-widget-edgeless-toolbar';
import { html } from 'lit';

import { buildLinkDenseMenu } from './link/link-dense-menu.js';

const defaultQuickTool = QuickToolExtension('default', ({ block }) => {
  return {
    type: 'default',
    content: html`<edgeless-default-tool-button
      .edgeless=${block}
    ></edgeless-default-tool-button>`,
  };
});

const linkQuickTool = QuickToolExtension('link', ({ block, gfx }) => {
  return {
    content: html`<edgeless-link-tool-button
      .edgeless=${block}
    ></edgeless-link-tool-button>`,
    menu: buildLinkDenseMenu(block, gfx),
  };
});

const templateSeniorTool = SeniorToolExtension('template', ({ block }) => {
  return {
    name: 'Template',
    content: html`<edgeless-template-button .edgeless=${block}>
    </edgeless-template-button>`,
  };
});

export const quickTools = [
  defaultQuickTool,
  frameQuickTool,
  connectorQuickTool,
  linkQuickTool,
];

export const seniorTools = [
  noteSeniorTool,
  penSeniorTool,
  shapeSeniorTool,
  mindMapSeniorTool,
  templateSeniorTool,
];
