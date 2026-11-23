import { SurfaceBlockSchema } from '@blocksuite/affine/blocks/surface';
import { BlockService } from '@blocksuite/affine/std';

export class MindmapSurfaceBlockService extends BlockService {
  static override readonly flavour = SurfaceBlockSchema.model.flavour;
}
