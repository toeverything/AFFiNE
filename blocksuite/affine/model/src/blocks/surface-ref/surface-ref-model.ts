import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type SurfaceRefProps = {
  reference: string;
  caption: string;
  refFlavour: string;
  frameScaleMode?: 'none' | 'zoom' | 'width';
  frameZoomScale?: number;
  frameWidthMode?: 'page' | 'full' | 'scale';
  frameWidthScale?: number;
  frameAspectLock?: boolean;
  frameAspectRatio?: string;
  frameRenderOptions?: {
    showInnerFrames?: boolean;
    showGrid?: boolean;
    showNotes?: boolean;
  };
  pageSizeScale?: number;
  pageWidthMode?: 'page' | 'full' | 'scale';
  pageWidthScale?: number;
  comments?: Record<string, boolean>;
};

export const SurfaceRefBlockSchema = defineBlockSchema({
  flavour: 'affine:surface-ref',
  props: (): SurfaceRefProps => ({
    reference: '',
    caption: '',
    refFlavour: '',
    frameScaleMode: undefined,
    frameZoomScale: undefined,
    frameWidthMode: undefined,
    frameWidthScale: undefined,
    frameAspectLock: undefined,
    frameAspectRatio: undefined,
    frameRenderOptions: undefined,
    pageSizeScale: undefined,
    pageWidthMode: undefined,
    pageWidthScale: undefined,
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
