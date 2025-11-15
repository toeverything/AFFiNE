const agent = globalThis.navigator?.userAgent ?? '';
const platform = globalThis.navigator?.platform || globalThis.process?.platform;

export const IS_WEB =
  typeof window !== 'undefined' && typeof document !== 'undefined';

export const IS_NODE = typeof process !== 'undefined' && !IS_WEB;

export const IS_SAFARI = /Apple Computer/.test(globalThis.navigator?.vendor);

export const IS_FIREFOX =
  IS_WEB && navigator.userAgent.toLowerCase().indexOf('firefox') > -1;

export const IS_ANDROID = /Android \d/.test(agent);

export const IS_IOS =
  IS_SAFARI &&
  (/Mobile\/\w+/.test(agent) || globalThis.navigator?.maxTouchPoints > 2);

export const IS_MAC = /Mac/i.test(platform) || /darwin/.test(platform);

export const IS_IPAD =
  /iPad/i.test(platform) ||
  /iPad/i.test(agent) ||
  (/Macintosh/i.test(agent) && globalThis.navigator?.maxTouchPoints > 2);

export const IS_WINDOWS = /Win/.test(platform) || /win32/.test(platform);

export const IS_LINUX = /Linux/.test(platform);

export const IS_MOBILE = IS_IOS || IS_IPAD || IS_ANDROID;
