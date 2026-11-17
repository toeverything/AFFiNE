import { FrameBlockSchema } from '@blocksuite/affine-model';
import {
  BlockHtmlAdapterExtension,
  type BlockHtmlAdapterMatcher,
} from '@blocksuite/affine-shared/adapters';

type FrameImageEntry = {
  id: string;
  name: string;
  alt?: string | null;
};

const FRAME_IMAGE_MAP_KEY = 'frame:export:image-map';

const getFrameImageMap = (configs: Map<string, string>) => {
  const raw = configs.get(FRAME_IMAGE_MAP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, FrameImageEntry>;
  } catch {
    return null;
  }
};

export const surfaceRefBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: 'affine:surface-ref',
  toMatch: () => false,
  fromMatch: o => o.node.flavour === 'affine:surface-ref',
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { configs, walkerContext, updateAssetIds } = context;
      const refFlavour = o.node.props.refFlavour as string | undefined;
      if (refFlavour !== FrameBlockSchema.model.flavour) {
        return;
      }

      const reference = o.node.props.reference as string | undefined;
      if (!reference) return;

      const imageMap = getFrameImageMap(configs);
      const entry = imageMap?.[reference];
      if (!entry) return;

      updateAssetIds?.(entry.id);
      walkerContext
        .openNode(
          {
            type: 'element',
            tagName: 'figure',
            properties: {
              className: ['affine-frame-block-container'],
            },
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'element',
            tagName: 'img',
            properties: {
              src: `assets/${entry.name}`,
              alt: entry.alt ?? entry.name,
              title: null,
            },
            children: [],
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};

export const SurfaceRefBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  surfaceRefBlockHtmlAdapterMatcher
);
