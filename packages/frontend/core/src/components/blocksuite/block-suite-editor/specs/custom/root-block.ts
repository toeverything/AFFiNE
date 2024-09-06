import {
  AIEdgelessRootBlockSpec,
  AIPageRootBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import { mixpanel } from '@affine/core/mixpanel';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { ConfigExtension, type ExtensionType } from '@blocksuite/block-std';
import {
  AffineCanvasTextFonts,
  EdgelessRootBlockSpec,
  FontLoaderService,
  PageRootBlockSpec,
} from '@blocksuite/blocks';
import {
  FontConfigExtension,
  type TelemetryEventMap,
  TelemetryProvider,
} from '@blocksuite/blocks';
import { type FrameworkProvider } from '@toeverything/infra';

import { createDatabaseOptionsConfig } from './database-block';
import { createLinkedWidgetConfig } from './widgets/linked';
import { createToolbarMoreMenuConfig } from './widgets/toolbar';

function getFontConfigExtension() {
  return FontConfigExtension(
    runtimeConfig.isSelfHosted
      ? AffineCanvasTextFonts.map(font => ({
          ...font,
          // self-hosted fonts are served from /assets
          url: '/assets/' + new URL(font.url).pathname.split('/').pop(),
        }))
      : AffineCanvasTextFonts
  );
}

function getTelemetryExtension(): ExtensionType {
  return {
    setup: di => {
      di.addImpl(TelemetryProvider, () => ({
        track: <T extends keyof TelemetryEventMap>(
          eventName: T,
          props: TelemetryEventMap[T]
        ) => {
          mixpanel.track(eventName as string, props as Record<string, unknown>);
        },
      }));
    },
  };
}

function getEditorConfigExtension(framework: FrameworkProvider) {
  const editorSettingService = framework.get(EditorSettingService);
  return ConfigExtension('affine:page', {
    linkedWidget: createLinkedWidgetConfig(framework),
    editorSetting: editorSettingService.editorSetting.settingSignal,
    toolbarMoreMenu: createToolbarMoreMenuConfig(framework),
    databaseOptions: createDatabaseOptionsConfig(framework),
  });
}

export function createPageRootBlockSpec(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    ...(enableAI ? AIPageRootBlockSpec : PageRootBlockSpec),
    FontLoaderService,
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ];
}

export function createEdgelessRootBlockSpec(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    ...(enableAI ? AIEdgelessRootBlockSpec : EdgelessRootBlockSpec),
    FontLoaderService,
    getFontConfigExtension(),
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ];
}
