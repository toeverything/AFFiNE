import log from 'electron-log';

export const logger = log.scope('helper');

log.transports.file.level = 'info';
