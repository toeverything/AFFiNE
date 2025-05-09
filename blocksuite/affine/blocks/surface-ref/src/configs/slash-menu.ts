import { EdgelessFrameManagerIdentifier } from '@blocksuite/affine-block-frame';
import { EdgelessCRUDExtension } from '@blocksuite/affine-block-surface';
import { MindmapStyle, SurfaceRefBlockSchema } from '@blocksuite/affine-model';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import { Bound } from '@blocksuite/global/gfx';
import { FrameIcon, GroupingIcon, MindmapIcon } from '@blocksuite/icons/lit';
import { BlockSelection } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

import { insertSurfaceRefBlockCommand } from '../commands';
import { EdgelessTooltip, FrameTooltip, MindMapTooltip } from './tooltips';

const surfaceRefSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    const crud = std.get(EdgelessCRUDExtension);
    const frameMgr = std.get(EdgelessFrameManagerIdentifier);

    const findSpace = (bound: Bound, padding = 20) => {
      const gfx = std.get(GfxControllerIdentifier);
      let elementInFrameBound = gfx.grid.search(bound);
      while (elementInFrameBound.length > 0) {
        const rightElement = elementInFrameBound.reduce((a, b) => {
          return a.x + a.w > b.x + b.w ? a : b;
        });
        bound.x = rightElement.x + rightElement.w + padding;
        elementInFrameBound = gfx.grid.search(bound);
      }
      return bound;
    };

    const insertSurfaceRefAndSelect = (reference: string) => {
      const [_, result] = std.command.exec(insertSurfaceRefBlockCommand, {
        reference,
        place: 'after',
        removeEmptyLine: true,
        selectedModels: [model],
      });
      if (!result.insertedSurfaceRefBlockId) return;

      std.selection.set([
        std.selection.create(BlockSelection, {
          blockId: result.insertedSurfaceRefBlockId,
        }),
      ]);
    };

    let index = 0;

    const insertBlankFrameItem: SlashMenuItem = {
      name: 'Frame',
      description: 'Insert a blank frame',
      icon: FrameIcon(),
      tooltip: {
        figure: FrameTooltip,
        caption: 'Frame',
      },
      group: `5_Edgeless Element@${index++}`,
      action: () => {
        const frameBound = findSpace(Bound.fromXYWH([0, 0, 1600, 900]));
        const frame = frameMgr.createFrameOnBound(frameBound);
        insertSurfaceRefAndSelect(frame.id);
      },
    };

    const insertMindMapItem: SlashMenuItem = {
      name: 'Mind Map',
      description: 'Insert a mind map',
      icon: MindmapIcon(),
      tooltip: {
        figure: MindMapTooltip,
        caption: 'Edgeless',
      },
      group: `5_Edgeless Element@${index++}`,
      action: () => {
        const bound = findSpace(Bound.fromXYWH([0, 0, 200, 200]), 150);
        const { x, y, h } = bound;

        const rootW = 145;
        const rootH = 50;

        const nodeW = 80;
        const nodeH = 35;

        const centerVertical = y + h / 2;
        const rootX = x;
        const rootY = centerVertical - rootH / 2;

        type MindMapNode = {
          children: MindMapNode[];
          text: string;
          xywh: string;
        };

        const root: MindMapNode = {
          children: [],
          text: 'Mind Map',
          xywh: `[${rootX},${rootY},${rootW},${rootH}]`,
        };

        for (let i = 0; i < 3; i++) {
          const nodeX = x + rootW + 300;
          const nodeY = centerVertical - nodeH / 2 + (i - 1) * 50;
          root.children.push({
            children: [],
            text: 'Text',
            xywh: `[${nodeX},${nodeY},${nodeW},${nodeH}]`,
          });
        }

        const mindmapId = crud.addElement('mindmap', {
          style: MindmapStyle.ONE,
          children: root,
        });
        if (!mindmapId) return;

        insertSurfaceRefAndSelect(mindmapId);
      },
    };

    const frameItems = frameMgr.frames.map<SlashMenuActionItem>(frameModel => ({
      name: 'Frame: ' + frameModel.props.title,
      icon: FrameIcon(),
      group: `5_Edgeless Element@${index++}`,
      tooltip: {
        figure: EdgelessTooltip,
        caption: 'Edgeless',
      },
      action: () => {
        insertSurfaceRefAndSelect(frameModel.id);
      },
    }));

    const groupElements = crud.getElementsByType('group');
    const groupItems = groupElements.map<SlashMenuActionItem>(group => ({
      name: 'Group: ' + group.title.toString(),
      icon: GroupingIcon(),
      group: `5_Edgeless Element@${index++}`,
      tooltip: {
        figure: EdgelessTooltip,
        caption: 'Edgeless',
      },
      action: () => {
        insertSurfaceRefAndSelect(group.id);
      },
    }));

    return [
      insertBlankFrameItem,
      insertMindMapItem,
      ...frameItems,
      ...groupItems,
    ];
  },
};

export const SurfaceRefSlashMenuConfigExtension = SlashMenuConfigExtension(
  SurfaceRefBlockSchema.model.flavour,
  surfaceRefSlashMenuConfig
);
