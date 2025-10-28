import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type SurfaceRefProps = {
  reference: string;
  caption: string;
  refFlavour: string;
  comments?: Record<string, boolean>;
};

export const SurfaceRefBlockSchema = defineBlockSchema({
  flavour: 'affine:surface-ref',
  props: (): SurfaceRefProps => ({
    reference: '',
    caption: '',
    refFlavour: '',
    comments: undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note', 'affine:paragraph', 'affine:list'],
  },
  toModel: () => new SurfaceRefBlockModel(),
});

export const SurfaceRefBlockSchemaExtension = BlockSchemaExtension(
  SurfaceRefBlockSchema
);

export class SurfaceRefBlockModel extends BlockModel<SurfaceRefProps> {}
