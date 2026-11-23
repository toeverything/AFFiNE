import type { SerializedXYWH } from '@blocksuite/global/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';
import * as Y from 'yjs';

import { SurfaceBlockModel as BaseSurfaceModel } from '../gfx/index.js';
import {
  GfxCompatibleBlockModel,
  type GfxCompatibleProps,
} from '../gfx/model/gfx-block-model.js';
import { TestShapeElement } from './test-gfx-element.js';

export const RootBlockSchema = defineBlockSchema({
  flavour: 'test:page',
  props: internal => ({
    title: internal.Text(),
    count: 0,
    style: {} as Record<string, unknown>,
    items: [] as unknown[],
  }),
  metadata: {
    version: 2,
    role: 'root',
    children: ['test:note', 'test:surface'],
  },
});

export const RootBlockSchemaExtension = BlockSchemaExtension(RootBlockSchema);

export class RootBlockModel extends BlockModel<
  ReturnType<(typeof RootBlockSchema)['model']['props']>
> {}

export const NoteBlockSchema = defineBlockSchema({
  flavour: 'test:note',
  props: () => ({}),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['test:page'],
    children: ['test:heading'],
  },
});

export const NoteBlockSchemaExtension = BlockSchemaExtension(NoteBlockSchema);

export class NoteBlockModel extends BlockModel<
  ReturnType<(typeof NoteBlockSchema)['model']['props']>
> {}

export const HeadingBlockSchema = defineBlockSchema({
  flavour: 'test:heading',
  props: internal => ({
    type: 'h1',
    text: internal.Text(),
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['test:note'],
  },
});

export const HeadingBlockSchemaExtension =
  BlockSchemaExtension(HeadingBlockSchema);

export class HeadingBlockModel extends BlockModel<
  ReturnType<(typeof HeadingBlockSchema)['model']['props']>
> {}

export const SurfaceBlockSchema = defineBlockSchema({
  flavour: 'test:surface',
  props: internal => ({
    elements: internal.Boxed<Y.Map<Y.Map<unknown>>>(new Y.Map()),
  }),
  metadata: {
    version: 1,
    role: 'hub',
    parent: ['test:page'],
  },
  toModel: () => new SurfaceBlockModel(),
});

export const SurfaceBlockSchemaExtension =
  BlockSchemaExtension(SurfaceBlockSchema);

export class SurfaceBlockModel extends BaseSurfaceModel {
  override _init() {
    this._extendElement({
      testShape: TestShapeElement,
    });
    super._init();
  }
}

type GfxTestBlockProps = {
  xywh: SerializedXYWH;
  rotate: number;
  index: string;
} & GfxCompatibleProps;

export const TestGfxBlockSchema = defineBlockSchema({
  flavour: 'test:gfx-block',
  props: () =>
    ({
      xywh: '[0,0,10,10]' as SerializedXYWH,
      rotate: 0,
      index: 'a0',
      lockedBySelf: false,
    }) as GfxTestBlockProps,
  metadata: {
    version: 1,
    role: 'content',
    parent: ['test:surface'],
  },
  toModel: () => new TestGfxBlockModel(),
});

export const TestGfxBlockSchemaExtension =
  BlockSchemaExtension(TestGfxBlockSchema);

export class TestGfxBlockModel extends GfxCompatibleBlockModel<GfxTestBlockProps>(
  BlockModel
) {}
