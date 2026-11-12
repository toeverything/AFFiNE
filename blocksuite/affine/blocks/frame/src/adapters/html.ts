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
const FRAME_SURFACE_REF_IDS_KEY = 'frame:export:surface-ref-ids';

const getFrameImageMap = (configs: Map<string, string>) => {
  const raw = configs.get(FRAME_IMAGE_MAP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, FrameImageEntry>;
  } catch {
    return null;
  }
};

const getReferencedFrameIds = (configs: Map<string, string>) => {
  const raw = configs.get(FRAME_SURFACE_REF_IDS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return null;
  }
};

export const frameBlockHtmlAdapterMatcher: BlockHtmlAdapterMatcher = {
  flavour: FrameBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === FrameBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { configs, walkerContext, updateAssetIds } = context;
      const referenced = getReferencedFrameIds(configs);
      if (referenced?.includes(o.node.id)) {
        return;
      }
      const imageMap = getFrameImageMap(configs);
      const entry = imageMap?.[o.node.id];
      if (!entry) {
        return;
      }

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

export const FrameBlockHtmlAdapterExtension = BlockHtmlAdapterExtension(
  frameBlockHtmlAdapterMatcher
);
