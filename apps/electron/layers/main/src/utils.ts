export function getTime() {
  return new Date().getTime();
}

export const isMac = (() => {
  return process.platform === 'darwin';
})();

export const isWindows = (() => {
  return process.platform === 'win32';
})();
