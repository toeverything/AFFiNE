import { DebugLogger } from '@affine/debug';
import { setupGlobal } from '@affine/env/global';
import type { DocCollection } from '@blocksuite/store';
import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { atomEffect } from 'jotai-effect';

import { getCurrentStore } from './root-store';

setupGlobal();

const logger = new DebugLogger('affine:settings');

export type DateFormats =
  | 'MM/dd/YYYY'
  | 'dd/MM/YYYY'
  | 'YYYY-MM-dd'
  | 'YYYY.MM.dd'
  | 'YYYY/MM/dd'
  | 'dd-MMM-YYYY'
  | 'dd MMMM YYYY';

export type AppSetting = {
  clientBorder: boolean;
  fullWidthLayout: boolean;
  windowFrameStyle: 'frameless' | 'NativeTitleBar';
  fontStyle: FontFamily;
  dateFormat: DateFormats;
  startWeekOnMonday: boolean;
  enableBlurBackground: boolean;
  enableNoisyBackground: boolean;
  autoCheckUpdate: boolean;
  autoDownloadUpdate: boolean;
  enableMultiView: boolean;
  enableTelemetry: boolean;
  editorFlags: Partial<Omit<BlockSuiteFlags, 'readonly'>>;
};
export const windowFrameStyleOptions: AppSetting['windowFrameStyle'][] = [
  'frameless',
  'NativeTitleBar',
];

export const dateFormatOptions: DateFormats[] = [
  'MM/dd/YYYY',
  'dd/MM/YYYY',
  'YYYY-MM-dd',
  'YYYY.MM.dd',
  'YYYY/MM/dd',
  'dd-MMM-YYYY',
  'dd MMMM YYYY',
];

export type FontFamily = 'Sans' | 'Serif' | 'Mono';

export const fontStyleOptions = [
  { key: 'Sans', value: 'var(--affine-font-sans-family)' },
  { key: 'Serif', value: 'var(--affine-font-serif-family)' },
  { key: 'Mono', value: 'var(--affine-font-mono-family)' },
] satisfies {
  key: FontFamily;
  value: string;
}[];

const appSettingBaseAtom = atomWithStorage<AppSetting>('affine-settings', {
  clientBorder: environment.isDesktop && !environment.isWindows,
  fullWidthLayout: false,
  windowFrameStyle: 'frameless',
  fontStyle: 'Sans',
  dateFormat: dateFormatOptions[0],
  startWeekOnMonday: false,
  enableBlurBackground: true,
  enableNoisyBackground: true,
  autoCheckUpdate: true,
  autoDownloadUpdate: true,
  enableTelemetry: true,
  enableMultiView: false,
  editorFlags: {},
});

export function setupEditorFlags(docCollection: DocCollection) {
  const store = getCurrentStore();
  const syncEditorFlags = () => {
    try {
      const editorFlags = getCurrentStore().get(appSettingBaseAtom).editorFlags;
      Object.entries(editorFlags ?? {}).forEach(([key, value]) => {
        docCollection.awarenessStore.setFlag(
          key as keyof BlockSuiteFlags,
          value
        );
      });

      // override this flag in app settings
      // TODO(@eyhn): need a better way to manage block suite flags
      Object.entries(blocksuiteFeatureFlags).forEach(([key, value]) => {
        if (value.defaultState !== undefined) {
          docCollection.awarenessStore.setFlag(
            key as keyof BlockSuiteFlags,
            value.defaultState
          );
        }
      });
    } catch (err) {
      logger.error('syncEditorFlags', err);
    }
  };
  store.sub(appSettingBaseAtom, syncEditorFlags);
  syncEditorFlags();
}

type SetStateAction<Value> = Value | ((prev: Value) => Value);

// todo(@pengx17): use global state instead
const appSettingEffect = atomEffect(get => {
  const settings = get(appSettingBaseAtom);
  // some values in settings should be synced into electron side
  if (environment.isDesktop) {
    logger.debug('sync settings to electron', settings);
    // this api type in @affine/electron-api, but it is circular dependency this package, use any here
    (window as any).apis?.updater
      .setConfig({
        autoCheckUpdate: settings.autoCheckUpdate,
        autoDownloadUpdate: settings.autoDownloadUpdate,
      })
      .catch((err: any) => {
        console.error(err);
      });
  }
});

export const appSettingAtom = atom<
  AppSetting,
  [SetStateAction<Partial<AppSetting>>],
  void
>(
  get => {
    get(appSettingEffect);
    return get(appSettingBaseAtom);
  },
  (_get, set, apply) => {
    set(appSettingBaseAtom, prev => {
      const next = typeof apply === 'function' ? apply(prev) : apply;
      return { ...prev, ...next };
    });
  }
);

export type BuildChannel = 'stable' | 'beta' | 'canary' | 'internal';

export type FeedbackType = 'discord' | 'email' | 'github';

export type PreconditionType = () => boolean | undefined;

export type Flag<K extends string> = Partial<{
  [key in K]: {
    displayName: string;
    description?: string;
    precondition?: PreconditionType;
    defaultState?: boolean; // default to open and not controlled by user
    feedbackType?: FeedbackType;
  };
}>;

const isNotStableBuild: PreconditionType = () => {
  return runtimeConfig.appBuildType !== 'stable';
};
const isDesktopEnvironment: PreconditionType = () => environment.isDesktop;
const neverShow: PreconditionType = () => false;

export const blocksuiteFeatureFlags: Flag<keyof BlockSuiteFlags> = {
  enable_database_attachment_note: {
    displayName: 'Database Attachment Note',
    description: 'Allows adding notes to database attachments.',
    precondition: isNotStableBuild,
  },
  enable_database_statistics: {
    displayName: 'Database Block Statistics',
    description: 'Shows statistics for database blocks.',
    precondition: isNotStableBuild,
  },
  enable_block_query: {
    displayName: 'Todo Block Query',
    description: 'Enables querying of todo blocks.',
    precondition: isNotStableBuild,
  },
  enable_synced_doc_block: {
    displayName: 'Synced Doc Block',
    description: 'Enables syncing of doc blocks.',
    precondition: neverShow,
    defaultState: true,
  },
  enable_edgeless_text: {
    displayName: 'Edgeless Text',
    description: 'Enables edgeless text blocks.',
    precondition: neverShow,
    defaultState: true,
  },
  enable_color_picker: {
    displayName: 'Color Picker',
    description: 'Enables color picker blocks.',
    precondition: neverShow,
    defaultState: true,
  },
  enable_ai_chat_block: {
    displayName: 'AI Chat Block',
    description: 'Enables AI chat blocks.',
    precondition: neverShow,
    defaultState: true,
  },
  enable_ai_onboarding: {
    displayName: 'AI Onboarding',
    description: 'Enables AI onboarding.',
    precondition: neverShow,
    defaultState: true,
  },
  enable_expand_database_block: {
    displayName: 'Expand Database Block',
    description: 'Enables expanding of database blocks.',
    precondition: neverShow,
    defaultState: true,
  },
};

export const affineFeatureFlags: Flag<keyof AppSetting> = {
  enableMultiView: {
    displayName: 'Split View',
    description:
      'The Split View feature in AFFiNE allows users to divide their workspace into multiple sections, enabling simultaneous viewing and editing of different documents.The Split View feature in AFFiNE allows users to divide their workspace into multiple sections, enabling simultaneous viewing and editing of different documents.',
    feedbackType: 'discord',
    precondition: isDesktopEnvironment,
  },
};
