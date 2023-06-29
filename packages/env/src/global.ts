/// <reference types="@blocksuite/global" />
import { assertEquals } from '@blocksuite/global/utils';
import type {
  DBHandlerManager,
  DebugHandlerManager,
  DialogHandlerManager,
  ExportHandlerManager,
  UIHandlerManager,
  UnwrapManagerHandlerToClientSide,
  UpdaterHandlerManager,
  WorkspaceHandlerManager,
} from '@toeverything/infra';
// fixme(himself65): remove `next/config` dependency
import getConfig from 'next/config';
import { z } from 'zod';

import { isBrowser, isDesktop, isServer } from './constant';
import { isValidIPAddress } from './is-valid-ip-address';
import { UaHelper } from './ua-helper';

declare global {
  interface Window {
    appInfo: {
      electron: boolean;
    };
    apis: {
      db: UnwrapManagerHandlerToClientSide<DBHandlerManager>;
      debug: UnwrapManagerHandlerToClientSide<DebugHandlerManager>;
      dialog: UnwrapManagerHandlerToClientSide<DialogHandlerManager>;
      export: UnwrapManagerHandlerToClientSide<ExportHandlerManager>;
      ui: UnwrapManagerHandlerToClientSide<UIHandlerManager>;
      updater: UnwrapManagerHandlerToClientSide<UpdaterHandlerManager>;
      workspace: UnwrapManagerHandlerToClientSide<WorkspaceHandlerManager>;
    };
    events: any;
  }

  // eslint-disable-next-line no-var
  var environment: Environment;
  // eslint-disable-next-line no-var
  var runtimeConfig: PublicRuntimeConfig;
  // eslint-disable-next-line no-var
  var $AFFINE_SETUP: boolean | undefined;
  // eslint-disable-next-line no-var
  var editorVersion: string | undefined;
  // eslint-disable-next-line no-var
  var prefixUrl: string;
  // eslint-disable-next-line no-var
  var websocketPrefixUrl: string;
}

export const buildFlagsSchema = z.object({
  /**
   * todo: remove this build flag when filter feature is ready.
   *
   * filter feature in the all pages.
   */
  enableAllPageFilter: z.boolean(),
  enablePlugin: z.boolean(),
  enableTestProperties: z.boolean(),
  enableBroadcastChannelProvider: z.boolean(),
  enableDebugPage: z.boolean(),
  enableLegacyCloud: z.boolean(),
  changelogUrl: z.string(),
  enablePreloading: z.boolean(),
  enableNewSettingModal: z.boolean(),
  enableSQLiteProvider: z.boolean(),
});

export const blockSuiteFeatureFlags = z.object({
  enable_database: z.boolean(),
  enable_drag_handle: z.boolean(),
  enable_surface: z.boolean(),
  enable_block_hub: z.boolean(),
  enable_slash_menu: z.boolean(),
  enable_edgeless_toolbar: z.boolean(),
  enable_linked_page: z.boolean(),
  enable_bookmark_operation: z.boolean(),
});

export type BlockSuiteFeatureFlags = z.infer<typeof blockSuiteFeatureFlags>;

export type BuildFlags = z.infer<typeof buildFlagsSchema>;

export const publicRuntimeConfigSchema = buildFlagsSchema.extend({
  PROJECT_NAME: z.string(),
  BUILD_DATE: z.string(),
  gitVersion: z.string(),
  hash: z.string(),
  serverAPI: z.string(),
  editorVersion: z.string(),
  editorFlags: blockSuiteFeatureFlags,
});

export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;

const { publicRuntimeConfig: config } = getConfig() as {
  publicRuntimeConfig: PublicRuntimeConfig;
};

publicRuntimeConfigSchema.parse(config);

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

function printBuildInfo() {
  console.group('Build info');
  console.log('Project:', config.PROJECT_NAME);
  console.log(
    'Build date:',
    config.BUILD_DATE ? new Date(config.BUILD_DATE).toLocaleString() : 'Unknown'
  );
  console.log('Editor Version:', config.editorVersion);

  console.log('Version:', config.gitVersion);
  console.log(
    'AFFiNE is an open source project, you can view its source code on GitHub!'
  );
  console.log(`https://github.com/toeverything/AFFiNE/tree/${config.hash}`);
  console.groupEnd();
}

export function setupGlobal() {
  if (globalThis.$AFFINE_SETUP) {
    return;
  }
  globalThis.runtimeConfig = config;
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

  if (environment.isBrowser) {
    printBuildInfo();
    globalThis.editorVersion = global.editorVersion;
  }

  let prefixUrl: string;
  if (!isBrowser || isDesktop) {
    // SSR or Desktop
    const serverAPI = runtimeConfig.serverAPI;
    if (isValidIPAddress(serverAPI.split(':')[0])) {
      // This is for Server side rendering support
      prefixUrl = new URL('http://' + runtimeConfig.serverAPI + '/').origin;
    } else {
      prefixUrl = serverAPI;
    }
    prefixUrl = prefixUrl.endsWith('/') ? prefixUrl : prefixUrl + '/';
  } else {
    const params = new URLSearchParams(window.location.search);
    if (params.get('prefixUrl')) {
      prefixUrl = params.get('prefixUrl') as string;
    } else {
      prefixUrl = window.location.origin + '/';
    }
  }

  const apiUrl = new URL(prefixUrl);
  const wsProtocol = apiUrl.protocol === 'https:' ? 'wss' : 'ws';
  const websocketPrefixUrl = `${wsProtocol}://${apiUrl.host}`;

  globalThis.prefixUrl = prefixUrl;
  globalThis.websocketPrefixUrl = websocketPrefixUrl;
  globalThis.$AFFINE_SETUP = true;
}
