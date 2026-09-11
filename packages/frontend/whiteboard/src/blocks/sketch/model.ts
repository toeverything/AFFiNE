import {
  type GfxCommonBlockProps,
  GfxCompatible,
} from '@blocksuite/affine/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  Boxed,
  defineBlockSchema,
  type Text,
} from '@blocksuite/affine/store';

import { WHITEBOARD_FLAVOURS } from '../../const';
import type { SketchAssets } from './types';

export type SketchBlockProps = {
  title: Text;
  sceneBlobId?: string;
  /** Phase 2: nbstore-synced Y.Doc guid (`Y.Array` elements, not blob LWW). */
  subdocGuid?: string;
  assets: Boxed<SketchAssets>;
  revision: number;
  snapshotSvgBlobId?: string;
  liveBudgetExempt?: boolean;
} & GfxCommonBlockProps;

export const SketchBlockSchema = defineBlockSchema({
  flavour: WHITEBOARD_FLAVOURS.sketch,
  props: (internal): SketchBlockProps => ({
    xywh: '[0,0,560,360]',
    index: 'a0',
    rotate: 0,
    scale: 1,
    lockedBySelf: false,
    title: internal.Text('Sketch'),
    sceneBlobId: undefined,
    subdocGuid: undefined,
    assets: internal.Boxed({} as SketchAssets),
    revision: 0,
    snapshotSvgBlobId: undefined,
    liveBudgetExempt: false,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:surface', 'affine:note'],
    children: [],
  },
  toModel: () => new SketchBlockModel(),
});

export const SketchBlockSchemaExtension =
  BlockSchemaExtension(SketchBlockSchema);

export class SketchBlockModel extends GfxCompatible<SketchBlockProps>(
  BlockModel
) {}
