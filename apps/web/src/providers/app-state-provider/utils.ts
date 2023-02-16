import { DataCenter } from '@affine/datacenter';

const DEFAULT_WORKSPACE_NAME = 'Demo Workspace';

export const createDefaultWorkspace = async (dataCenter: DataCenter) => {
  return dataCenter.createWorkspace({
    name: DEFAULT_WORKSPACE_NAME,
  });
};
