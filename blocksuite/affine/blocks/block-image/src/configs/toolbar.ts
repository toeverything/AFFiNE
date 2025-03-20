import { ImageBlockModel } from '@blocksuite/affine-model';
import {
  type ToolbarModuleConfig,
  ToolbarModuleExtension,
} from '@blocksuite/affine-shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/block-std';
import { CaptionIcon, DownloadIcon } from '@blocksuite/icons/lit';
import type { ExtensionType } from '@blocksuite/store';

import { ImageEdgelessBlockComponent } from '../image-edgeless-block';

const trackBaseProps = {
  category: 'image',
  type: 'card view',
};

const builtinSurfaceToolbarConfig = {
  actions: [
    {
      id: 'a.download',
      tooltip: 'Download',
      icon: DownloadIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(ImageEdgelessBlockComponent);
        block?.download();
      },
    },
    {
      id: 'b.caption',
      tooltip: 'Caption',
      icon: CaptionIcon(),
      run(ctx) {
        const block = ctx.getCurrentBlockByType(ImageEdgelessBlockComponent);
        block?.captionEditor?.show();

        ctx.track('OpenedCaptionEditor', {
          ...trackBaseProps,
          control: 'add caption',
        });
      },
    },
  ],

  when: ctx => ctx.getSurfaceModelsByType(ImageBlockModel).length === 1,
} as const satisfies ToolbarModuleConfig;

export const createBuiltinToolbarConfigExtension = (
  flavour: string
): ExtensionType[] => {
  const name = flavour.split(':').pop();

  return [
    ToolbarModuleExtension({
      id: BlockFlavourIdentifier(`affine:surface:${name}`),
      config: builtinSurfaceToolbarConfig,
    }),
  ];
};
