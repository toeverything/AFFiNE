import { shell } from 'electron';
import log from 'electron-log';

export const logger = log;

export function revealLogFile() {
  const filePath = log.transports.file.getFile().path;
  shell.showItemInFolder(filePath);
}
