import { WorkspaceFlavour } from '@affine/env/workspace';
import type { FeatureType } from '@affine/graphql';
import {
  availableFeaturesQuery,
  enabledFeaturesQuery,
  setWorkspaceExperimentalFeatureMutation,
} from '@affine/graphql';
import type { WorkspaceMetadata } from '@toeverything/infra';

import { useAsyncCallback } from './affine-async-hooks';
import { useMutateQueryResource, useMutation } from './use-mutation';
import { useQueryImmutable } from './use-query';

const emptyFeatures: FeatureType[] = [];

export const useWorkspaceAvailableFeatures = (
  workspaceMetadata: WorkspaceMetadata
) => {
  const isCloudWorkspace =
    workspaceMetadata.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { data } = useQueryImmutable(
    isCloudWorkspace
      ? {
          query: availableFeaturesQuery,
          variables: {
            id: workspaceMetadata.id,
          },
        }
      : undefined
  );
  return data?.workspace.availableFeatures ?? emptyFeatures;
};

export const useWorkspaceEnabledFeatures = (
  workspaceMetadata: WorkspaceMetadata
) => {
  const isCloudWorkspace =
    workspaceMetadata.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { data } = useQueryImmutable(
    isCloudWorkspace
      ? {
          query: enabledFeaturesQuery,
          variables: {
            id: workspaceMetadata.id,
          },
        }
      : undefined
  );
  return data?.workspace.features ?? emptyFeatures;
};

export const useSetWorkspaceFeature = (
  workspaceMetadata: WorkspaceMetadata
) => {
  const { trigger, isMutating } = useMutation({
    mutation: setWorkspaceExperimentalFeatureMutation,
  });
  const revalidate = useMutateQueryResource();

  return {
    trigger: useAsyncCallback(
      async (feature: FeatureType, enable: boolean) => {
        await trigger({
          workspaceId: workspaceMetadata.id,
          feature,
          enable,
        });
        await revalidate(enabledFeaturesQuery, vars => {
          return vars.id === workspaceMetadata.id;
        });
      },
      [workspaceMetadata.id, revalidate, trigger]
    ),
    isMutating,
  };
};
