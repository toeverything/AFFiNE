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

function withAffineRootService(Service: typeof RootService) {
  return class extends Service {
    override loadFonts(): void {
      customLoadFonts(this);
    }

    telemetryService = {
      track: (event: string, data: Record<string, unknown>) => {
        mixpanel.track(event, data);
      },
    };
  };
}

export const CustomPageRootBlockSpec: BlockSpec = {
  ...AIPageRootBlockSpec,
  service: withAffineRootService(PageRootService),
};

export const CustomEdgelessRootBlockSpec: BlockSpec = {
  ...AIEdgelessRootBlockSpec,
  service: withAffineRootService(EdgelessRootService),
};
