/// <reference types="@blocksuite/global" />
import { assertEquals } from '@blocksuite/global/utils';
import { z } from 'zod';

import { isDesktop, isServer } from './constant.js';
import { UaHelper } from './ua-helper.js';

export const blockSuiteFeatureFlags = z.object({
  enable_database: z.boolean(),
  enable_database_filter: z.boolean(),
  enable_data_view: z.boolean(),
  enable_page_tags: z.boolean(),
  enable_drag_handle: z.boolean(),
  enable_surface: z.boolean(),
  enable_block_hub: z.boolean(),
  enable_slash_menu: z.boolean(),
  enable_toggle_block: z.boolean(),
  enable_edgeless_toolbar: z.boolean(),
  enable_linked_page: z.boolean(),
  enable_bookmark_operation: z.boolean(),
  enable_note_index: z.boolean(),
  enable_attachment_block: z.boolean(),
});

export const runtimeFlagsSchema = z.object({
  enablePlugin: z.boolean(),
  enableTestProperties: z.boolean(),
  enableBroadcastChannelProvider: z.boolean(),
  enableDebugPage: z.boolean(),
  changelogUrl: z.string(),
  // see: packages/workers
  imageProxyUrl: z.string(),
  enablePreloading: z.boolean(),
  enableNewSettingModal: z.boolean(),
  enableNewSettingUnstableApi: z.boolean(),
  enableSQLiteProvider: z.boolean(),
  enableNotificationCenter: z.boolean(),
  enableCloud: z.boolean(),
  enableEnhanceShareMode: z.boolean(),
  // this is for the electron app
  serverUrlPrefix: z.string(),
  enableMoveDatabase: z.boolean(),
  editorFlags: blockSuiteFeatureFlags,
  appVersion: z.string(),
  editorVersion: z.string(),
});

export type BlockSuiteFeatureFlags = z.infer<typeof blockSuiteFeatureFlags>;

export type RuntimeConfig = z.infer<typeof runtimeFlagsSchema>;

export const platformSchema = z.enum([
  'aix',
  'android',
  'darwin',
  'freebsd',
  'haiku',
  'linux',
  'openbsd',
  'sunos',
  'win32',
  'cygwin',
  'netbsd',
]);

export type Platform = z.infer<typeof platformSchema>;

type BrowserBase = {
  /**
   * @example https://app.affine.pro
   * @example http://localhost:3000
   */
  origin: string;
  isDesktop: boolean;
  isBrowser: true;
  isServer: false;
  isDebug: boolean;

  // browser special properties
  isLinux: boolean;
  isMacOs: boolean;
  isIOS: boolean;
  isSafari: boolean;
  isWindows: boolean;
  isFireFox: boolean;
  isMobile: boolean;
  isChrome: boolean;
};

type NonChromeBrowser = BrowserBase & {
  isChrome: false;
};

type ChromeBrowser = BrowserBase & {
  isSafari: false;
  isFireFox: false;
  isChrome: true;
  chromeVersion: number;
};

type Browser = NonChromeBrowser | ChromeBrowser;

type Server = {
  isDesktop: false;
  isBrowser: false;
  isServer: true;
  isDebug: boolean;
};

interface Desktop extends ChromeBrowser {
  isDesktop: true;
  isBrowser: true;
  isServer: false;
  isDebug: boolean;
}

export type Environment = Browser | Server | Desktop;

export function setupGlobal() {
  if (globalThis.$AFFINE_SETUP) {
    return;
  }
  runtimeFlagsSchema.parse(runtimeConfig);

  let environment: Environment;
  const isDebug = process.env.NODE_ENV === 'development';
  if (isServer) {
    environment = {
      isDesktop: false,
      isBrowser: false,
      isServer: true,
      isDebug,
    } satisfies Server;
  } else {
    const uaHelper = new UaHelper(navigator);

    environment = {
      origin: window.location.origin,
      isDesktop,
      isBrowser: true,
      isServer: false,
      isDebug,
      isLinux: uaHelper.isLinux,
      isMacOs: uaHelper.isMacOs,
      isSafari: uaHelper.isSafari,
      isWindows: uaHelper.isWindows,
      isFireFox: uaHelper.isFireFox,
      isMobile: uaHelper.isMobile,
      isChrome: uaHelper.isChrome,
      isIOS: uaHelper.isIOS,
    } as Browser;
    // Chrome on iOS is still Safari
    if (environment.isChrome && !environment.isIOS) {
      assertEquals(environment.isSafari, false);
      assertEquals(environment.isFireFox, false);
      environment = {
        ...environment,
        isSafari: false,
        isFireFox: false,
        isChrome: true,
        chromeVersion: uaHelper.getChromeVersion(),
      } satisfies ChromeBrowser;
    }
  }
  globalThis.environment = environment;

  globalThis.$AFFINE_SETUP = true;
}
