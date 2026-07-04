import log from 'electron-log/main';

export const logger = log.scope('helper');

log.transports.file.level = 'info';
log.transports.console.level =
  process.env.NODE_ENV === 'development' ? 'info' : false;
