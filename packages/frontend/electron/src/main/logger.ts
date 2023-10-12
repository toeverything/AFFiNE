import { shell } from 'electron';
import log from 'electron-log';

export const logger = log.scope('main');
export const pluginLogger = log.scope('plugin');
log.initialize();

export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export async function revealLogFile() {
  const filePath = getLogFilePath();
  return await shell.openPath(filePath);
}
