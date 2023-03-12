import { DataCenter } from './datacenter';

const _initializeDataCenter = () => {
  let _dataCenterInstance: Promise<DataCenter>;

  return () => {
    if (!_dataCenterInstance) {
      _dataCenterInstance = DataCenter.init();
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

export type { DataCenter };
export * from './message';
export { messages } from './message/code';
export { AffineProvider } from './provider/affine';
export * from './provider/affine/apis';
export { getAuthorizer, GoogleAuth } from './provider/affine/apis/google';
export {
  createAuthClient,
  createBareClient,
} from './provider/affine/apis/request';
export { RequestError } from './provider/affine/apis/request-error';
export * from './provider/affine/apis/workspace';
export { WebsocketProvider } from './provider/affine/sync';
export { IndexedDBProvider } from './provider/local/indexeddb/indexeddb';
export * from './types';
export { WorkspaceUnit } from './workspace-unit';
