import { UaHelper } from './ua-helper.js';

export type BUILD_CONFIG_TYPE = {
  debug: boolean;
  distribution: 'web' | 'desktop' | 'admin' | 'mobile';
  /**
   * 'web' | 'desktop' | 'admin'
   */
  isDesktopEdition: boolean;
  /**
   * 'mobile'
   */
  isMobileEdition: boolean;

  isElectron: boolean;
  isWeb: boolean;
  isMobileWeb: boolean;

  // this is for the electron app
  /**
   * @deprecated need to be refactored
   */
  serverUrlPrefix: string;
  appVersion: string;
  editorVersion: string;
  appBuildType: 'stable' | 'beta' | 'internal' | 'canary';

  githubUrl: string;
  changelogUrl: string;
  downloadUrl: string;
  // see: tools/workers
  imageProxyUrl: string;
  linkPreviewUrl: string;

  // TODO(@forehalo): remove
  isSelfHosted: boolean;
};

export type Environment = {
  // Device
  isLinux: boolean;
  isMacOs: boolean;
  isIOS: boolean;
  isSafari: boolean;
  isWindows: boolean;
  isFireFox: boolean;
  isMobile: boolean;
  isChrome: boolean;
  isPwa: boolean;

  chromeVersion?: number;
};

export function setupGlobal() {
  if (globalThis.$AFFINE_SETUP) {
    return;
  }

  let environment: Environment;

  if (!globalThis.navigator) {
    environment = {
      isLinux: false,
      isMacOs: false,
      isSafari: false,
      isWindows: false,
      isFireFox: false,
      isChrome: false,
      isIOS: false,
      isPwa: false,
      isMobile: false,
    };
  } else {
    const uaHelper = new UaHelper(globalThis.navigator);

    environment = {
      isMobile: uaHelper.isMobile,
      isLinux: uaHelper.isLinux,
      isMacOs: uaHelper.isMacOs,
      isSafari: uaHelper.isSafari,
      isWindows: uaHelper.isWindows,
      isFireFox: uaHelper.isFireFox,
      isChrome: uaHelper.isChrome,
      isIOS: uaHelper.isIOS,
      isPwa: uaHelper.isStandalone,
    };
    // Chrome on iOS is still Safari
    if (environment.isChrome && !environment.isIOS) {
      environment = {
        ...environment,
        isSafari: false,
        isFireFox: false,
        isChrome: true,
        chromeVersion: uaHelper.getChromeVersion(),
      };
    }
  }

  globalThis.environment = environment;

  globalThis.$AFFINE_SETUP = true;
}
