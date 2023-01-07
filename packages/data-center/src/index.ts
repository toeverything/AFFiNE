import debug from 'debug';
import { DataCenter } from './dataCenter';

const _initializeDataCenter = () => {
  let _dataCenterInstance: Promise<DataCenter>;

  return (debug = true) => {
    if (!_dataCenterInstance) {
      _dataCenterInstance = DataCenter.init(debug);
      _dataCenterInstance.then(dc => {
        try {
          if (window) {
            (window as any).dc = dc;
          }
        } catch (_) {
          // ignore
        }

        return dc;
      });
    }

    return _dataCenterInstance;
  };
};

export const getDataCenter = _initializeDataCenter();

export function getLogger(namespace: string) {
  const logger = debug(namespace);
  logger.log = console.log.bind(console);
  return logger;
}

export type { AccessTokenMessage } from './apis';
export type { Workspace } from './types';
