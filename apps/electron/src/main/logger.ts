import { app, shell } from 'electron';
import log from 'electron-log';

export const logger = log.scope('main');
log.initialize();

app.on('before-quit', () => {
  log.transports.console.level = false;
});

export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export async function revealLogFile() {
  const filePath = getLogFilePath();
  return await shell.openPath(filePath);
}
