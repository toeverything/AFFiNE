import { FrameBlockSchema } from '@blocksuite/affine-model';
import {
  BlockMarkdownAdapterExtension,
  type BlockMarkdownAdapterMatcher,
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

export const frameBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher = {
  flavour: FrameBlockSchema.model.flavour,
  toMatch: () => false,
  fromMatch: o => o.node.flavour === FrameBlockSchema.model.flavour,
  toBlockSnapshot: {},
  fromBlockSnapshot: {
    enter: (o, context) => {
      const { configs, walkerContext, updateAssetIds } = context;
      const referenced = getReferencedFrameIds(configs);
      if (referenced && referenced.length > 0) {
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
            type: 'paragraph',
            children: [],
          },
          'children'
        )
        .openNode(
          {
            type: 'image',
            url: `assets/${entry.name}`,
            title: null,
            alt: entry.alt ?? null,
          },
          'children'
        )
        .closeNode()
        .closeNode();
    },
  },
};

export const FrameBlockMarkdownAdapterExtension = BlockMarkdownAdapterExtension(
  frameBlockMarkdownAdapterMatcher
);
