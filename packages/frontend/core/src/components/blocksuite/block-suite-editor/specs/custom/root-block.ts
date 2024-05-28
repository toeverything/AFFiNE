import { mixpanel } from '@affine/core/utils';
import type { BlockSpec } from '@blocksuite/block-std';
import type { RootService } from '@blocksuite/blocks';
import {
  AffineCanvasTextFonts,
  EdgelessRootService,
  PageRootService,
} from '@blocksuite/blocks';
import {
  AIEdgelessRootBlockSpec,
  AIPageRootBlockSpec,
} from '@blocksuite/presets';
import type { BlockModel } from '@blocksuite/store';

function customLoadFonts(service: RootService): void {
  if (runtimeConfig.isSelfHosted) {
    const fonts = AffineCanvasTextFonts.map(font => ({
      ...font,
      // self-hosted fonts are served from /assets
      url: '/assets/' + new URL(font.url).pathname.split('/').pop(),
    }));
    service.fontLoader.load(fonts);
  } else {
    service.fontLoader.load(AffineCanvasTextFonts);
  }
}

class CustomPageRootService extends PageRootService {
  override loadFonts(): void {
    customLoadFonts(this);
  }
}

class CustomEdgelessRootService extends EdgelessRootService {
  override loadFonts(): void {
    customLoadFonts(this);
  }

  override addElement<T = Record<string, unknown>>(type: string, props: T) {
    const res = super.addElement(type, props);
    mixpanel.track('WhiteboardObjectCreated', {
      page: 'whiteboard editor',
      module: 'whiteboard',
      segment: 'canvas',
      // control:
      type: 'whiteboard object',
      category: type,
    });
    return res;
  }

  override addBlock(
    flavour: string,
    props: Record<string, unknown>,
    parent?: string | BlockModel,
    parentIndex?: number
  ) {
    const res = super.addBlock(flavour, props, parent, parentIndex);
    mixpanel.track('WhiteboardObjectCreated', {
      page: 'whiteboard editor',
      module: 'whiteboard',
      segment: 'canvas',
      // control:
      type: 'whiteboard object',
      category: flavour.split(':')[1], // affine:paragraph -> paragraph
    });
    return res;
  }
}

export const CustomPageRootBlockSpec: BlockSpec = {
  ...AIPageRootBlockSpec,
  service: CustomPageRootService,
};

export const CustomEdgelessRootBlockSpec: BlockSpec = {
  ...AIEdgelessRootBlockSpec,
  service: CustomEdgelessRootService,
};
