import type {
  GraphQLQuery,
  MutationOptions,
  QueryOptions,
  QueryResponse,
  QueryVariables,
} from '@affine/graphql';
import { gqlFetcherFactory } from '@affine/graphql';
import type { GraphQLError } from 'graphql';
import type { SWRConfiguration, SWRResponse } from 'swr';
import useSWR from 'swr';
import type {
  SWRMutationConfiguration,
  SWRMutationResponse,
} from 'swr/mutation';
import useSWRMutation from 'swr/mutation';

const fetcher = gqlFetcherFactory(prefixUrl + '/graphql');

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
  options: QueryOptions<Query>
): SWRResponse<QueryResponse<Query>, GraphQLError | GraphQLError[]>;
export function useQuery<Query extends GraphQLQuery>(
  options: QueryOptions<Query>,
  config: Omit<
    SWRConfiguration<
      QueryResponse<Query>,
      GraphQLError | GraphQLError[],
      typeof fetcher<Query>
    >,
    'fetcher'
  >
): SWRResponse<QueryResponse<Query>, GraphQLError | GraphQLError[]>;
export function useQuery<Query extends GraphQLQuery>(
  options: QueryOptions<Query>,
  config?: any
) {
  return useSWR(
    () => [options.query.id, options.variables],
    () => fetcher(options),
    config
  );
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
export function useMutation<Mutation extends GraphQLQuery>(
  options: Omit<MutationOptions<Mutation>, 'variables'>
): SWRMutationResponse<
  QueryResponse<Mutation>,
  GraphQLError | GraphQLError[],
  QueryVariables<Mutation>
>;
export function useMutation<Mutation extends GraphQLQuery>(
  options: Omit<MutationOptions<Mutation>, 'variables'>,
  config: Omit<
    SWRMutationConfiguration<
      QueryResponse<Mutation>,
      GraphQLError | GraphQLError[],
      QueryVariables<Mutation>
    >,
    'fetcher'
  >
): SWRMutationResponse<
  QueryResponse<Mutation>,
  GraphQLError | GraphQLError[],
  QueryVariables<Mutation>
>;
export function useMutation(
  options: Omit<MutationOptions<GraphQLQuery>, 'variables'>,
  config?: any
) {
  return useSWRMutation(
    options.mutation.id,
    (_: string, { arg }: { arg: any }) =>
      fetcher({ ...options, query: options.mutation, variables: arg }),
    config
  );
}

export const gql = fetcher;
