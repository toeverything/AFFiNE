import { setupGlobal } from '@affine/env/global';
import type {
  GraphQLQuery,
  MutationOptions,
  QueryOptions,
  QueryResponse,
  QueryVariables,
  RecursiveMaybeFields,
} from '@affine/graphql';
import { gqlFetcherFactory } from '@affine/graphql';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import type { GraphQLError } from 'graphql';
import { useMemo } from 'react';
import type { Key, SWRConfiguration, SWRResponse } from 'swr';
import useSWR, { useSWRConfig } from 'swr';
import useSWRInfinite from 'swr/infinite';
import type {
  SWRMutationConfiguration,
  SWRMutationResponse,
} from 'swr/mutation';
import useSWRMutation from 'swr/mutation';

setupGlobal();

export const fetcher = gqlFetcherFactory(
  runtimeConfig.serverUrlPrefix + '/graphql'
);

/**
 * A `useSWR` wrapper for sending graphql queries
 *
 * @example
 *
 * ```ts
 * import { someQuery, someQueryWithNoVars } from '@affine/graphql'
 *
 * const swrResponse1 = useQuery({
 *   query: workspaceByIdQuery,
 *   variables: { id: '1' }
 * })
 *
 * const swrResponse2 = useQuery({
 *   query: someQueryWithNoVars
 * })
 * ```
 */
export function useQuery<Query extends GraphQLQuery>(
  options: QueryOptions<Query>,
  config?: Omit<
    SWRConfiguration<
      QueryResponse<Query>,
      GraphQLError | GraphQLError[],
      typeof fetcher<Query>
    >,
    'fetcher'
  >
): SWRResponse<
  QueryResponse<Query>,
  GraphQLError | GraphQLError[],
  {
    suspense: true;
  }
>;
export function useQuery<Query extends GraphQLQuery>(
  options: QueryOptions<Query>,
  config?: any
) {
  const configWithSuspense: SWRConfiguration = useMemo(
    () => ({
      suspense: true,
      ...config,
    }),
    [config]
  );

  return useSWR(
    () => ['cloud', options.query.id, options.variables],
    () => fetcher(options),
    configWithSuspense
  );
}

export function useQueryInfinite<Query extends GraphQLQuery>(
  options: Omit<QueryOptions<Query>, 'variables'> & {
    getVariables: (
      pageIndex: number,
      previousPageData: QueryResponse<Query>
    ) => QueryOptions<Query>['variables'];
  },
  config?: Omit<
    SWRConfiguration<
      QueryResponse<Query>,
      GraphQLError | GraphQLError[],
      typeof fetcher<Query>
    >,
    'fetcher'
  >
) {
  const configWithSuspense: SWRConfiguration = useMemo(
    () => ({
      suspense: true,
      ...config,
    }),
    [config]
  );

  const { data, setSize, size, error } = useSWRInfinite<
    QueryResponse<Query>,
    GraphQLError | GraphQLError[]
  >(
    (pageIndex: number, previousPageData: QueryResponse<Query>) => [
      'cloud',
      options.query.id,
      options.getVariables(pageIndex, previousPageData),
    ],
    async ([_, __, variables]) => {
      const params = { ...options, variables } as QueryOptions<Query>;
      return fetcher(params);
    },
    configWithSuspense
  );

  const loadingMore = size > 0 && data && !data[size - 1];

  // todo: find a generic way to know whether or not there are more items to load
  const loadMore = useAsyncCallback(async () => {
    if (loadingMore) {
      return;
    }
    await setSize(size => size + 1);
  }, [loadingMore, setSize]);
  return {
    data,
    error,
    loadingMore,
    loadMore,
  };
}

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
      GraphQLError | GraphQLError[],
      K,
      QueryVariables<Mutation>
    >,
    'fetcher'
  >
): SWRMutationResponse<
  QueryResponse<Mutation>,
  GraphQLError | GraphQLError[],
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

export const gql = fetcher;

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
