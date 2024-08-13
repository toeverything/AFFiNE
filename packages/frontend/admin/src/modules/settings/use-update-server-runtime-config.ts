import { notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import {
  getServerRuntimeConfigQuery,
  updateServerRuntimeConfigsMutation,
} from '@affine/graphql';

export const useUpdateServerRuntimeConfigs = () => {
  const { trigger, isMutating } = useMutation({
    mutation: updateServerRuntimeConfigsMutation,
  });
  const revalidate = useMutateQueryResource();

  return {
    trigger: useAsyncCallback(
      async (values: any) => {
        try {
          await trigger(values);
          await revalidate(getServerRuntimeConfigQuery);
          notify.success({
            title: 'Saved successfully',
            message: 'Runtime configurations have been saved successfully.',
          });
        } catch (e) {
          notify.error({
            title: 'Failed to save',
            message:
              'Failed to save runtime configurations, please try again later.',
          });
          console.error(e);
        }
      },
      [revalidate, trigger]
    ),
    isMutating,
  };
};
