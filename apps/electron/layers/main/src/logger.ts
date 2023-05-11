import { shell } from 'electron';
import log from 'electron-log';

export const logger = log;

export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export function revealLogFile() {
  const filePath = getLogFilePath();
  shell.showItemInFolder(filePath);
}
