import { DefaultTool } from '@blocksuite/affine-block-surface';
import { menu } from '@blocksuite/affine-components/context-menu';
import type { DenseMenuBuilder } from '@blocksuite/affine-widget-edgeless-toolbar';
import { FrameIcon } from '@blocksuite/icons/lit';

import { EdgelessFrameManagerIdentifier } from '../frame-manager.js';
import { FrameTool } from '../frame-tool';
import { FrameConfig } from './config.js';

export const buildFrameDenseMenu: DenseMenuBuilder = (edgeless, gfx) =>
  menu.subMenu({
    name: 'Frame',
    prefix: FrameIcon({ width: '20px', height: '20px' }),
    select: () => gfx.tool.setTool(FrameTool),
    isSelected: gfx.tool.currentToolName$.peek() === 'frame',
    options: {
      items: [
        menu.action({
          name: 'Custom',
          select: () => gfx.tool.setTool(FrameTool),
        }),
        ...FrameConfig.map(config =>
          menu.action({
            name: `Slide ${config.name}`,
            select: () => {
              const frame = edgeless.std.get(EdgelessFrameManagerIdentifier);
              gfx.tool.setTool(DefaultTool);
              frame.createFrameOnViewportCenter(config.wh);
            },
          })
        ),
      ],
    },
  });
