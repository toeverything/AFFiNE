import { createIdentifier } from '@blocksuite/global/di';
import type { EditorHost } from '@blocksuite/std';
import type { ViewportRecord } from '@blocksuite/std/gfx';
import type { BlockModel } from '@blocksuite/store';
import { Extension } from '@blocksuite/store';

import type { BlockLayout, Rect } from '../types';

export abstract class BlockLayoutHandlerExtension<
  T extends BlockLayout = BlockLayout,
> extends Extension {
  abstract readonly blockType: string;

  abstract queryLayout(
    model: BlockModel,
    host: EditorHost,
    viewportRecord: ViewportRecord
  ): T | null;

  abstract calculateBound(layout: T): {
    rect: Rect;
    subRects: Rect[];
  };
}

export const BlockLayoutHandlersIdentifier =
  createIdentifier<BlockLayoutHandlerExtension>(
    'BlockLayoutHandlersIdentifier'
  );
