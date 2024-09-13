import type {
  GraphQLQuery,
  MutationOptions,
  QueryResponse,
  QueryVariables,
  RecursiveMaybeFields,
} from '@affine/graphql';
import { fetcher } from '@affine/graphql';
import type { GraphQLError } from 'graphql';
import { useMemo } from 'react';
import type { Key } from 'swr';
import { useSWRConfig } from 'swr';
import type {
  SWRMutationConfiguration,
  SWRMutationResponse,
} from 'swr/mutation';
import useSWRMutation from 'swr/mutation';

/**
 * A useSWRMutation wrapper for sending graphql mutations
 *
 * @example
 *
 * ```ts
 * import { someMutation } from '@affine/graphql'
 *
 * const { trigger } = useMutation({
 *  mutation: someMutation,
 * })
 *
 * trigger({ name: 'John Doe' })
 */
export function useMutation<Mutation extends GraphQLQuery, K extends Key = Key>(
  options: Omit<MutationOptions<Mutation>, 'variables'>,
  config?: Omit<
    SWRMutationConfiguration<
      QueryResponse<Mutation>,
      GraphQLError,
      K,
      QueryVariables<Mutation>
    >,
    'fetcher'
  >
): SWRMutationResponse<
  QueryResponse<Mutation>,
  GraphQLError,
  K,
  QueryVariables<Mutation>
>;
export function useMutation(
  options: Omit<MutationOptions<GraphQLQuery>, 'variables'>,
  config?: any
) {
  return useSWRMutation(
    () => ['cloud', options.mutation.id],
    (_: unknown[], { arg }: { arg: any }) =>
      fetcher({ ...options, query: options.mutation, variables: arg }),
    config
  );
}

// use this to revalidate all queries that match the filter
export const useMutateQueryResource = () => {
  const { mutate } = useSWRConfig();
  const revalidateResource = useMemo(
    () =>
      <Q extends GraphQLQuery>(
        query: Q,
        varsFilter: (
          vars: RecursiveMaybeFields<QueryVariables<Q>>
        ) => boolean = _vars => true
      ) => {
        return mutate(key => {
          const res =
            Array.isArray(key) &&
            key[0] === 'cloud' &&
            key[1] === query.id &&
            varsFilter(key[2]);
          if (res) {
            console.debug('revalidate resource', key);
          }
          return res;
        });
      },
    [mutate]
  );

  return revalidateResource;
};
