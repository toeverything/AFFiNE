import { useQuery } from '@affine/core/hooks/use-query';
import type { PagePropertyType } from '@affine/core/modules/properties/services/schema';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { getWorkspacePageMetaByIdQuery } from '@affine/graphql';
import { createContext, useContext } from 'react';
import type { Middleware } from 'swr';

import type { PagePropertiesManager } from './page-properties-manager';

// @ts-expect-error this should always be set
export const managerContext = createContext<PagePropertiesManager>();

export const useCloudPageMeta = (type: PagePropertyType) => {
  const manager = useContext(managerContext);
  const isCloud = manager.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { data, error, isLoading } = useQuery({
    query: getWorkspacePageMetaByIdQuery,
    variables: {
      id: manager.workspace.id,
      pageId: manager.pageId,
    },
  });

  if (!!error || !data?.workspace?.pageMeta) return { isCloud, isLoading };
  const pageMeta = data.workspace.pageMeta;
  return {
    isCloud,
    isLoading,
    metadata: pageMeta[type as keyof typeof pageMeta],
  };
};

export const SWRCustomHandler: Middleware =
  next => (key, fetcher: any, config: any) => {
    const wrappedFetcher = (...args: any[]) =>
      fetcher?.(...args).catch(() => null);
    return next(key, wrappedFetcher, config);
  };
