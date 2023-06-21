import type { ExecutionResult } from 'graphql';
import { GraphQLError } from 'graphql';
import { isNil, isObject, merge } from 'lodash-es';

import type { GraphQLQuery } from './graphql';
import type { Mutations, Queries } from './schema';

export type NotArray<T> = T extends Array<unknown> ? never : T;

export type _QueryVariables<Q extends GraphQLQuery> =
  Q['id'] extends Queries['name']
    ? Extract<Queries, { name: Q['id'] }>['variables']
    : Q['id'] extends Mutations['name']
    ? Extract<Mutations, { name: Q['id'] }>['variables']
    : undefined;

export type QueryVariables<Q extends GraphQLQuery> = _QueryVariables<Q> extends
  | never
  | Record<string, never>
  ? never
  : _QueryVariables<Q>;

export type QueryResponse<Q extends GraphQLQuery> = Extract<
  Queries | Mutations,
  { name: Q['id'] }
>['response'];

type NullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? K : never;
}[keyof T];

type NonNullableKeys<T> = {
  [K in keyof T]: null extends T[K] ? never : K;
}[keyof T];

export type RecursiveMaybeFields<T> = T extends
  | number
  | boolean
  | string
  | null
  | undefined
  ? T
  : {
      [K in NullableKeys<T>]?: RecursiveMaybeFields<T[K]>;
    } & {
      [K in NonNullableKeys<T>]: RecursiveMaybeFields<T[K]>;
    };

type AllowedRequestContext = Omit<RequestInit, 'method' | 'body'>;

export interface RequestBody {
  operationName?: string;
  variables: any;
  query: string;
  form?: FormData;
}

type QueryVariablesOption<Q extends GraphQLQuery> =
  QueryVariables<Q> extends never
    ? {
        variables?: undefined;
      }
    : { variables: RecursiveMaybeFields<QueryVariables<Q>> };

export type RequestOptions<Q extends GraphQLQuery> = QueryVariablesOption<Q> & {
  /**
   * parameter passed to `fetch` function
   */
  context?: AllowedRequestContext;
  /**
   * Whether keep null or undefined value in variables.
   *
   * if `false` given, `{ a: 0, b: undefined, c: null }` will be converted to `{ a: 0 }`
   *
   * @default true
   */
  keepNilVariables?: boolean;
};

export type QueryOptions<Q extends GraphQLQuery> = RequestOptions<Q> & {
  query: Q;
};
export type MutationOptions<M extends GraphQLQuery> = RequestOptions<M> & {
  mutation: M;
};

function filterEmptyValue(vars: any) {
  const newVars: Record<string, any> = {};
  Object.entries(vars).forEach(([key, value]) => {
    if (isNil(value)) {
      return;
    }
    if (isObject(value) && !(value instanceof File)) {
      newVars[key] = filterEmptyValue(value);
      return;
    }
    newVars[key] = value;
  });

  return newVars;
}

export function transformToForm(body: RequestBody) {
  const form = new FormData();
  const gqlBody: {
    name?: string;
    query: string;
    variables: any;
    map: any;
  } = {
    query: body.query,
    variables: body.variables,
    map: {},
  };

  if (body.operationName) {
    gqlBody.name = body.operationName;
  }

  if (body.variables) {
    let i = 0;
    Object.entries(body.variables).forEach(([key, value]) => {
      if (value instanceof File) {
        gqlBody.map['0'] = [`variables.${key}`];
        form.append(`${i}`, value);
        i++;
      }
    });
  }

  form.append('operations', JSON.stringify(gqlBody));
  return form;
}

function formatRequestBody<Q extends GraphQLQuery>({
  query,
  variables,
  keepNilVariables,
}: QueryOptions<Q>): RequestBody | FormData {
  const body: RequestBody = {
    query: query.query,
    variables:
      keepNilVariables ?? true ? variables : filterEmptyValue(variables),
  };

  if (query.operationName) {
    body.operationName = query.operationName;
  }

  if (query.containsFile) {
    return transformToForm(body);
  }
  return body;
}

export const gqlFetcherFactory = (endpoint: string) => {
  const gqlFetch = async <Query extends GraphQLQuery>(
    options: QueryOptions<Query>
  ): Promise<QueryResponse<Query>> => {
    const body = formatRequestBody(options);

    const ret = fetch(
      endpoint,
      merge(options.context, {
        method: 'POST',
        headers: {
          'x-operation-name': options.query.operationName,
          'x-definition-name': options.query.definitionName,
        },
        body: body instanceof FormData ? body : JSON.stringify(body),
      })
    ).then(async res => {
      if (res.headers.get('content-type') === 'application/json') {
        const result = (await res.json()) as ExecutionResult;
        if (res.status >= 400) {
          if (result.errors && result.errors.length > 0) {
            throw result.errors.map(
              error => new GraphQLError(error.message, error)
            );
          } else {
            throw new GraphQLError('Empty GraphQL error body');
          }
        } else if (result.data) {
          // we have to cast here because the type of result.data is a union type
          return result.data as any;
        }
      }

      throw new GraphQLError('GraphQL query responds unexpected result');
    });

    return ret;
  };

  return gqlFetch;
};
