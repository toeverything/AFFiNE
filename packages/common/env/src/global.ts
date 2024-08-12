/// <reference types="@blocksuite/global" />
import { assertEquals } from '@blocksuite/global/utils';
import { z } from 'zod';

import { isDesktop, isServer } from './constant.js';
import { UaHelper } from './ua-helper.js';

export const runtimeFlagsSchema = z.object({
  // this is for the electron app
  serverUrlPrefix: z.string(),
  appVersion: z.string(),
  editorVersion: z.string(),
  appBuildType: z.union([
    z.literal('stable'),
    z.literal('beta'),
    z.literal('internal'),
    z.literal('canary'),
  ]),
  isSelfHosted: z.boolean().optional(),
  githubUrl: z.string(),
  changelogUrl: z.string(),
  downloadUrl: z.string(),
  // see: tools/workers
  imageProxyUrl: z.string(),
  linkPreviewUrl: z.string(),
  allowLocalWorkspace: z.boolean(),
  enablePreloading: z.boolean(),
  enableNewSettingUnstableApi: z.boolean(),
  enableCaptcha: z.boolean(),
  enableEnhanceShareMode: z.boolean(),
  enableExperimentalFeature: z.boolean(),
  enableInfoModal: z.boolean(),
  enableOrganize: z.boolean(),
  enableThemeEditor: z.boolean(),
});

export type RuntimeConfig = z.infer<typeof runtimeFlagsSchema>;

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
