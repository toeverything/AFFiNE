import debug from 'debug';

export function getLogger(namespace: string) {
  const logger = debug(namespace);
  logger.log = console.log.bind(console);
  return logger;
}
