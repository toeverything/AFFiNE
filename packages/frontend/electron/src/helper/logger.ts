import log from 'electron-log/main';

export const logger = log.scope('helper');

log.transports.file.level = 'info';
