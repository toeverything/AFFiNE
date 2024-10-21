import { UaHelper } from './ua-helper.js';

export type BUILD_CONFIG_TYPE = {
  debug: boolean;
  distribution: 'web' | 'desktop' | 'admin' | 'mobile' | 'ios' | 'android';
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
  isIOS: boolean;
  isAndroid: boolean;

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
};

export type Environment = {
  // Variant
  isSelfHosted: boolean;

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

  // runtime configs
  publicPath: string;
};

export function setupGlobal() {
  if (globalThis.$AFFINE_SETUP) {
    return;
  }

  let environment: Environment = {
    isLinux: false,
    isMacOs: false,
    isSafari: false,
    isWindows: false,
    isFireFox: false,
    isChrome: false,
    isIOS: false,
    isPwa: false,
    isMobile: false,
    isSelfHosted: false,
    publicPath: '/',
  };

  if (globalThis.navigator) {
    const uaHelper = new UaHelper(globalThis.navigator);

    environment = {
      ...environment,
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

  applyEnvironmentOverrides(environment);

  globalThis.environment = environment;
  globalThis.$AFFINE_SETUP = true;
}

function applyEnvironmentOverrides(environment: Environment) {
  if (typeof document === 'undefined') {
    return;
  }

  const metaTags = document.querySelectorAll('meta');

  metaTags.forEach(meta => {
    if (!meta.name.startsWith('env:')) {
      return;
    }

    const name = meta.name.substring(4);

    // all environments should have default value
    // so ignore non-defined overrides
    if (name in environment) {
      // @ts-expect-error safe
      environment[name] =
        // @ts-expect-error safe
        typeof environment[name] === 'string'
          ? meta.content
          : JSON.parse(meta.content);
    }
  });
}
