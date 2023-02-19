import { DataCenter } from './datacenter';

const _initializeDataCenter = () => {
  let _dataCenterInstance: Promise<DataCenter>;

  return (debug = true) => {
    if (!_dataCenterInstance) {
      _dataCenterInstance = DataCenter.init(debug);
    }

    return _dataCenterInstance;
  };
};

export const getDataCenter = _initializeDataCenter();

export { DataCenter };
export { getLogger } from './logger';
export * from './message';
export { AffineProvider } from './provider/affine';
export * from './provider/affine/apis';
export * from './types';
export { WorkspaceUnit } from './workspace-unit';
