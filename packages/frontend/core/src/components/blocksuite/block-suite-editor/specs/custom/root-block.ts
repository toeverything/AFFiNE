import {
  AIEdgelessRootBlockSpec,
  AIPageRootBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import { mixpanel } from '@affine/core/mixpanel';
import type {
  EdgelessRootBlockSpecType,
  PageRootBlockSpecType,
  RootService,
  TelemetryEventMap,
} from '@blocksuite/blocks';
import {
  AffineCanvasTextFonts,
  EdgelessRootService,
  PageRootService,
} from '@blocksuite/blocks';
import { type FrameworkProvider } from '@toeverything/infra';

import { createLinkedWidgetConfig } from './linked-widget';

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

    override telemetryService = {
      track: <T extends keyof TelemetryEventMap>(
        eventName: T,
        props: TelemetryEventMap[T]
      ) => {
        mixpanel.track(eventName as string, props as Record<string, unknown>);
      },
    };
  };
}

export function createPageRootBlockSpec(
  framework: FrameworkProvider
): PageRootBlockSpecType {
  return {
    ...AIPageRootBlockSpec,
    service: withAffineRootService(PageRootService),
    config: {
      linkedWidget: createLinkedWidgetConfig(framework),
    },
  };
}

export function createEdgelessRootBlockSpec(
  framework: FrameworkProvider
): EdgelessRootBlockSpecType {
  return {
    ...AIEdgelessRootBlockSpec,
    service: withAffineRootService(EdgelessRootService),
    config: {
      linkedWidget: createLinkedWidgetConfig(framework),
    },
  };
}
