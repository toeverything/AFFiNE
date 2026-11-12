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

const getFrameImageMap = (configs: Map<string, string>) => {
  const raw = configs.get(FRAME_IMAGE_MAP_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, FrameImageEntry>;
  } catch {
    return null;
  }
};

export const surfaceRefBlockMarkdownAdapterMatcher: BlockMarkdownAdapterMatcher =
  {
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

export const SurfaceRefBlockMarkdownAdapterExtension =
  BlockMarkdownAdapterExtension(surfaceRefBlockMarkdownAdapterMatcher);
