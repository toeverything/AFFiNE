import { getUaHelper } from './ua-helper';

type Browser = {
  isBrowser: true;
  isServer: false;
  isDebug: boolean;

  // browser special properties
  isLinux: boolean;
  isMacOs: boolean;
  isSafari: boolean;
  isWindows: boolean;
  isFireFox: boolean;
};

type Server = {
  isBrowser: false;
  isServer: true;
  isDebug: boolean;
};

export type Environment = Browser | Server;

let environment: Environment | null = null;

export function getEnvironment() {
  if (environment) {
    return environment;
  }
  const isDebug = process.env.NODE_ENV === 'development';
  if (typeof window === 'undefined') {
    environment = {
      isBrowser: false,
      isServer: true,
      isDebug,
    } satisfies Server;
  } else {
    const uaHelper = getUaHelper();
    environment = {
      isBrowser: true,
      isServer: false,
      isDebug,
      isLinux: uaHelper.isLinux,
      isMacOs: uaHelper.isMacOs,
      isSafari: uaHelper.isSafari,
      isWindows: uaHelper.isWindows,
      isFireFox: uaHelper.isFireFox,
    } satisfies Browser;
  }
  return environment;
}
