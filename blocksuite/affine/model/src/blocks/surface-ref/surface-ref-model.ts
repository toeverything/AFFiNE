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
  // The doc `reference` lives in, if different from the doc this block
  // itself lives in. Optional: existing surface-ref blocks predating this
  // field, and any same-doc reference, simply omit it — the resolver falls
  // back to a same-doc lookup (and, failing that, a legacy brute-force
  // workspace scan) when unset. Populated at creation time by the cross-doc
  // picker; same-doc creation (the existing Frame slash-menu item) leaves
  // it undefined, matching current behavior exactly.
  refDocId?: string;
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
    refDocId: undefined,
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
