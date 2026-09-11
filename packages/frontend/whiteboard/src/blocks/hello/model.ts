import {
  type GfxCommonBlockProps,
  GfxCompatible,
} from '@blocksuite/affine/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/affine/store';

import { WHITEBOARD_FLAVOURS } from '../../const';

export type HelloBlockProps = {
  title: string;
  snapshotBlobId?: string;
} & GfxCommonBlockProps;

export const HelloBlockSchema = defineBlockSchema({
  flavour: WHITEBOARD_FLAVOURS.hello,
  props: (): HelloBlockProps => ({
    xywh: '[0,0,280,160]',
    index: 'a0',
    rotate: 0,
    scale: 1,
    lockedBySelf: false,
    title: 'Hello',
    snapshotBlobId: undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:surface', 'affine:note'],
    children: [],
  },
  toModel: () => new HelloBlockModel(),
});

export const HelloBlockSchemaExtension = BlockSchemaExtension(HelloBlockSchema);

export class HelloBlockModel extends GfxCompatible<HelloBlockProps>(
  BlockModel
) {}
