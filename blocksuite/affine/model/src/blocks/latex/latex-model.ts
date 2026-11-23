import {
  type GfxCommonBlockProps,
  GfxCompatible,
  type GfxElementGeometry,
} from '@blocksuite/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type LatexProps = {
  latex: string;
  comments?: Record<string, boolean>;
} & GfxCommonBlockProps;

export const LatexBlockSchema = defineBlockSchema({
  flavour: 'affine:latex',
  props: (): LatexProps => ({
    xywh: '[0,0,16,16]',
    index: 'a0',
    lockedBySelf: false,
    scale: 1,
    rotate: 0,
    latex: '',
    comments: undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: [
      'affine:note',
      'affine:edgeless-text',
      'affine:paragraph',
      'affine:list',
    ],
  },
  toModel: () => {
    return new LatexBlockModel();
  },
});

export const LatexBlockSchemaExtension = BlockSchemaExtension(LatexBlockSchema);

export class LatexBlockModel
  extends GfxCompatible<LatexProps>(BlockModel)
  implements GfxElementGeometry {}
