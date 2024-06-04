import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useMutateQueryResource,
  useMutation,
} from '@affine/core/hooks/use-mutation';
import {
  type CreateUserInput,
  createUserMutation,
  getUserListQuery,
} from '@affine/graphql';

export const useCreateUser = () => {
  const { trigger, isMutating } = useMutation({
    mutation: createUserMutation,
  });

  const revalidate = useMutateQueryResource();

  return {
    trigger: useAsyncCallback(
      async (data: CreateUserInput) => {
        const name = data.name;
        const email = data.email;
        const password = data.password;
        await trigger({
          input: {
            name,
            email,
            password,
          },
        });
        await revalidate(getUserListQuery);
      },
      [revalidate, trigger]
    ),
    isMutating,
  };
};
