import {
  AIEdgelessRootBlockSpec,
  AIPageRootBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import { EditorSettingService } from '@affine/core/modules/editor-settting';
import { mixpanel } from '@affine/track';
import { ConfigExtension, type ExtensionType } from '@blocksuite/block-std';
import {
  EdgelessRootBlockSpec,
  EditorSettingExtension,
  FontLoaderService,
  PageRootBlockSpec,
} from '@blocksuite/blocks';
import { type TelemetryEventMap, TelemetryProvider } from '@blocksuite/blocks';
import { type FrameworkProvider } from '@toeverything/infra';

import { getFontConfigExtension } from '../font-extension';
import { createDatabaseOptionsConfig } from './database-block';
import { createLinkedWidgetConfig } from './widgets/linked';
import { createToolbarMoreMenuConfig } from './widgets/toolbar';

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

function getEditorConfigExtension(
  framework: FrameworkProvider
): ExtensionType[] {
  const editorSettingService = framework.get(EditorSettingService);
  return [
    EditorSettingExtension(editorSettingService.editorSetting.settingSignal),
    ConfigExtension('affine:page', {
      linkedWidget: createLinkedWidgetConfig(framework),
      toolbarMoreMenu: createToolbarMoreMenuConfig(framework),
      databaseOptions: createDatabaseOptionsConfig(framework),
    }),
  ];
}

export function createPageRootBlockSpec(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    enableAI ? AIPageRootBlockSpec : PageRootBlockSpec,
    FontLoaderService,
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ].flat();
}

export function createEdgelessRootBlockSpec(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    enableAI ? AIEdgelessRootBlockSpec : EdgelessRootBlockSpec,
    FontLoaderService,
    getFontConfigExtension(),
    getTelemetryExtension(),
    getEditorConfigExtension(framework),
  ].flat();
}
