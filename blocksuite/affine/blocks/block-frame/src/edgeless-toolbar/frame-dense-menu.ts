import { menu } from '@blocksuite/affine-components/context-menu';
import type { DenseMenuBuilder } from '@blocksuite/affine-widget-edgeless-toolbar';
import { FrameIcon } from '@blocksuite/icons/lit';

import { EdgelessFrameManagerIdentifier } from '../frame-manager.js';
import { FrameConfig } from './config.js';

export const buildFrameDenseMenu: DenseMenuBuilder = (edgeless, gfx) =>
  menu.subMenu({
    name: 'Frame',
    prefix: FrameIcon({ width: '20px', height: '20px' }),
    select: () => gfx.tool.setTool({ type: 'frame' }),
    isSelected: gfx.tool.currentToolName$.peek() === 'frame',
    options: {
      items: [
        menu.action({
          name: 'Custom',
          select: () => gfx.tool.setTool({ type: 'frame' }),
        }),
        ...FrameConfig.map(config =>
          menu.action({
            name: `Slide ${config.name}`,
            select: () => {
              const frame = edgeless.std.get(EdgelessFrameManagerIdentifier);
              // @ts-expect-error FIXME: resolve after gfx tool refactor
              gfx.tool.setTool('default');
              frame.createFrameOnViewportCenter(config.wh);
            },
          })
        ),
      ],
    },
  });
