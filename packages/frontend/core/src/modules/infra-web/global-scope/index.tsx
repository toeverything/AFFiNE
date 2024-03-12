import {
  type ServiceProvider,
  ServiceProviderContext,
  useLiveData,
  useService,
} from '@toeverything/infra';
import type React from 'react';

import { CurrentWorkspaceService } from '../../workspace';

export const GlobalScopeProvider: React.FC<
  React.PropsWithChildren<{ provider: ServiceProvider }>
> = ({ provider: rootProvider, children }) => {
  const currentWorkspaceService = useService(CurrentWorkspaceService, {
    provider: rootProvider,
  });

  const workspaceProvider = useLiveData(
    currentWorkspaceService.currentWorkspace
  )?.services;

  return (
    <ServiceProviderContext.Provider value={workspaceProvider ?? rootProvider}>
      {children}
    </ServiceProviderContext.Provider>
  );
};
