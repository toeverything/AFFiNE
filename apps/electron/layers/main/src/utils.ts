export function getTime() {
  return new Date().getTime();
}

export const isMac = process.platform === 'darwin'

export const isWindows = process.platform === 'win32'
