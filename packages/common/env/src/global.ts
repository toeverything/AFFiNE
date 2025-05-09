import { UaHelper } from './ua-helper.js';

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
    // publicPath is the root of assets files
    publicPath: '/',
    // subPath is the path to access the affine service
    subPath: '',
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
