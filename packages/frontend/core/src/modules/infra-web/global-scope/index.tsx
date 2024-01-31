import type { Page } from '@toeverything/infra';
import {
  LiveData,
  ServiceCollection,
  type ServiceProvider,
  ServiceProviderContext,
  useLiveData,
  useService,
  useServiceOptional,
} from '@toeverything/infra';
import type React from 'react';

import { CurrentPageService } from '../../page';
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

  const currentPageService = useServiceOptional(CurrentPageService, {
    provider: workspaceProvider ?? ServiceCollection.EMPTY.provider(),
  });

  const pageProvider = useLiveData(
    currentPageService?.currentPage ?? new LiveData<Page | null>(null)
  )?.services;

  return (
    <ServiceProviderContext.Provider
      value={pageProvider ?? workspaceProvider ?? rootProvider}
    >
      {children}
    </ServiceProviderContext.Provider>
  );
};
