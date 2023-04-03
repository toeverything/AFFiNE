import { assertEquals } from '@blocksuite/global/utils';
import getConfig from 'next/config';
import { z } from 'zod';

import { getUaHelper } from './ua-helper';

type BrowserBase = {
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

let environment: Environment | null = null;

export function getEnvironment() {
  if (environment) {
    return environment;
  }
  const isDebug = process.env.NODE_ENV === 'development';
  if (typeof window === 'undefined') {
    environment = {
      isDesktop: false,
      isBrowser: false,
      isServer: true,
      isDebug,
    } satisfies Server;
  } else {
    const uaHelper = getUaHelper();
    environment = {
      isDesktop: window.appInfo?.electron,
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
  return environment;
}

export const publicRuntimeConfigSchema = z.object({
  PROJECT_NAME: z.string(),
  BUILD_DATE: z.string(),
  gitVersion: z.string(),
  hash: z.string(),
  serverAPI: z.string(),
  editorVersion: z.string(),
  enableIndexedDBProvider: z.boolean(),
  enableBroadCastChannelProvider: z.boolean(),
  prefetchWorkspace: z.boolean(),
  enableDebugPage: z.boolean(),
  // expose internal api to globalThis, **development only**
  exposeInternal: z.boolean(),
  enableSubpage: z.boolean(),
  enableChangeLog: z.boolean(),
});

export type PublicRuntimeConfig = z.infer<typeof publicRuntimeConfigSchema>;

const { publicRuntimeConfig: config } =
  getConfig() ??
  ({
    publicRuntimeConfig: {},
  } as {
    publicRuntimeConfig: PublicRuntimeConfig;
  });

publicRuntimeConfigSchema.parse(config);

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

declare global {
  // eslint-disable-next-line no-var
  var environment: Environment;
  // eslint-disable-next-line no-var
  var $AFFINE_SETUP: boolean | undefined;
  // eslint-disable-next-line no-var
  var editorVersion: string | undefined;
}

export function setupGlobal() {
  if (globalThis.$AFFINE_SETUP) {
    return;
  }
  globalThis.environment = getEnvironment();
  if (getEnvironment().isBrowser) {
    printBuildInfo();
    globalThis.editorVersion = config.editorVersion;
  }
  globalThis.$AFFINE_SETUP = true;
}

export { config };
export * from './constant';
