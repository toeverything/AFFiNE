import {
  type GfxCommonBlockProps,
  GfxCompatible,
} from '@blocksuite/affine/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
  type Text,
} from '@blocksuite/affine/store';

import { WHITEBOARD_FLAVOURS } from '../../const';
import type { BoardTemplate } from './types';

export type BoardBlockProps = {
  title: Text;
  linkedDocId?: string;
  blockId?: string;
  template?: BoardTemplate;
  snapshotBlobId?: string;
  liveBudgetExempt?: boolean;
} & GfxCommonBlockProps;

export const BoardBlockSchema = defineBlockSchema({
  flavour: WHITEBOARD_FLAVOURS.board,
  props: (internal): BoardBlockProps => ({
    xywh: '[0,0,720,420]',
    index: 'a0',
    rotate: 0,
    scale: 1,
    lockedBySelf: false,
    title: internal.Text('Board'),
    linkedDocId: undefined,
    blockId: undefined,
    template: 'todo',
    snapshotBlobId: undefined,
    liveBudgetExempt: false,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:surface', 'affine:note'],
    children: [],
  },
  toModel: () => new BoardBlockModel(),
});

export const BoardBlockSchemaExtension = BlockSchemaExtension(BoardBlockSchema);

export class BoardBlockModel extends GfxCompatible<BoardBlockProps>(
  BlockModel
) {}
