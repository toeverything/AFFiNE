import { app, shell } from 'electron';
import log from 'electron-log/main';

export const logger = log.scope('main');
log.initialize({
  preload: false,
});

log.transports.file.level = 'info';

export function getLogFilePath() {
  return log.transports.file.getFile().path;
}

export async function revealLogFile() {
  const filePath = getLogFilePath();
  return await shell.openPath(filePath);
}

app.on('before-quit', () => {
  log.transports.console.level = false;
});
