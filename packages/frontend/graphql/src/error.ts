import { GraphQLError as BaseGraphQLError } from 'graphql';
import { identity } from 'lodash-es';

import type { ErrorDataUnion, ErrorNames } from './schema';

interface KnownGraphQLErrorExtensions {
  status: number;
  code: string;
  type: string;
  name: ErrorNames;
  message: string;
  args?: any;

  stacktrace?: string;
}

export class GraphQLError extends BaseGraphQLError {
  // @ts-expect-error better to be a known type without any type casting
  override extensions!: KnownGraphQLErrorExtensions;
}
export function findGraphQLError(
  errOrArr: any,
  filter: (err: GraphQLError) => boolean = identity
): GraphQLError | undefined {
  if (errOrArr instanceof GraphQLError) {
    return filter(errOrArr) ? errOrArr : undefined;
  } else if (Array.isArray(errOrArr)) {
    return errOrArr.find(err => err instanceof GraphQLError && filter(err));
  } else {
    return undefined;
  }
}

type ToPascalCase<S extends string> = S extends `${infer A}_${infer B}`
  ? `${Capitalize<Lowercase<A>>}${ToPascalCase<B>}`
  : Capitalize<Lowercase<S>>;

export type ErrorData = {
  [K in ErrorNames]: Extract<
    ErrorDataUnion,
    { __typename?: `${ToPascalCase<K>}DataType` }
  >;
};
