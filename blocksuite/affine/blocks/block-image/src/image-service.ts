import { SurfaceBlockModel } from '@blocksuite/affine-block-surface';
import { FileDropConfigExtension } from '@blocksuite/affine-components/drop-indicator';
import { ImageBlockSchema, MAX_IMAGE_WIDTH } from '@blocksuite/affine-model';
import {
  FileSizeLimitService,
  TelemetryProvider,
} from '@blocksuite/affine-shared/services';
import {
  isInsideEdgelessEditor,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import { GfxControllerIdentifier } from '@blocksuite/block-std/gfx';

import { addImages, addSiblingImageBlock } from './utils.js';

export const ImageDropOption = FileDropConfigExtension({
  flavour: ImageBlockSchema.model.flavour,
  onDrop: ({ files, targetModel, placement, point, std }) => {
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) return false;

    const maxFileSize = std.store.get(FileSizeLimitService).maxFileSize;

    if (targetModel && !matchModels(targetModel, [SurfaceBlockModel])) {
      addSiblingImageBlock(
        std.host,
        imageFiles,
        maxFileSize,
        targetModel,
        placement
      );
      return true;
    }

    if (isInsideEdgelessEditor(std.host)) {
      const gfx = std.get(GfxControllerIdentifier);
      point = gfx.viewport.toViewCoordFromClientCoord(point);
      addImages(std, files, { point, maxWidth: MAX_IMAGE_WIDTH })
        .then(() => {
          std.getOptional(TelemetryProvider)?.track('CanvasElementAdded', {
            control: 'canvas:drop',
            page: 'whiteboard editor',
            module: 'toolbar',
            segment: 'toolbar',
            type: 'image',
          });
        })
        .catch(console.error);

      return true;
    }

    return false;
  },
});
