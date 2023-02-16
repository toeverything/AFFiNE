import { DataCenter } from './datacenter';

declare global {
  // eslint-disable-next-line no-var
  var dc: DataCenter;
}

const _initializeDataCenter = () => {
  let _dataCenterPromise: Promise<DataCenter>;
  let once = false;

  return (debug = true) => {
    if (!_dataCenterPromise && !once) {
      once = true;
      _dataCenterPromise = DataCenter.init(debug);
      _dataCenterPromise.then(dc => {
        if (globalThis.dc) {
          console.warn('globalThis.dc already exists. Please fix this ASAP.');
        }
        globalThis.dc = dc;

        return dc;
      });
    }

    return _dataCenterPromise;
  };
};

export const getDataCenter = _initializeDataCenter();

export type { DataCenter };
export * from './provider/affine/apis';
export { WorkspaceUnit } from './workspace-unit';
export { getLogger } from './logger';
export * from './message';
export * from './types';
