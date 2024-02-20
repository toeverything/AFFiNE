import { GraphQLError as BaseGraphQLError } from 'graphql';
import { identity } from 'lodash-es';

interface KnownGraphQLErrorExtensions {
  code: number;
  status: string;
  originalError?: unknown;
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
