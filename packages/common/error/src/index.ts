import type { ErrorDataUnion, ErrorNames } from '@affine/graphql';
import { GraphQLError as BaseGraphQLError } from 'graphql';

export type ErrorName =
  | keyof typeof ErrorNames
  | 'NETWORK_ERROR'
  | 'CONTENT_TOO_LARGE'
  | 'REQUEST_ABORTED';

export interface UserFriendlyErrorResponse {
  status: number;
  code: string;
  type: string;
  name: ErrorName;
  message: string;
  data?: any;
  stacktrace?: string;
}

function UnknownError(message: string) {
  return new UserFriendlyError({
    status: 500,
    code: 'INTERNAL_SERVER_ERROR',
    type: 'INTERNAL_SERVER_ERROR',
    name: 'INTERNAL_SERVER_ERROR',
    message,
  });
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

export class GraphQLError extends BaseGraphQLError {
  // @ts-expect-error better to be a known type without any type casting
  override extensions!: UserFriendlyErrorResponse;
}

export class UserFriendlyError
  extends Error
  implements UserFriendlyErrorResponse
{
  readonly status = this.response.status;
  readonly code = this.response.code;
  readonly type = this.response.type;
  override readonly name = this.response.name;
  override readonly message = this.response.message;
  readonly data = this.response.data;
  readonly stacktrace = this.response.stacktrace;

  static fromAny(anything: any) {
    if (anything instanceof UserFriendlyError) {
      return anything;
    }

    switch (typeof anything) {
      case 'string':
        return UnknownError(anything);
      case 'object': {
        if (anything) {
          if (anything instanceof GraphQLError) {
            return new UserFriendlyError(anything.extensions);
          } else if (anything.type && anything.name && anything.message) {
            return new UserFriendlyError(anything);
          } else if (anything.message) {
            return UnknownError(anything.message);
          }
        }
      }
    }

    return UnknownError('Unhandled error raised. Please contact us for help.');
  }

  constructor(private readonly response: UserFriendlyErrorResponse) {
    super(response.message);
  }

  is(name: ErrorName) {
    return this.name === name;
  }

  isStatus(status: number) {
    return this.status === status;
  }

  static isNetworkError(error: UserFriendlyError) {
    return error.name === 'NETWORK_ERROR';
  }

  static notNetworkError(error: UserFriendlyError) {
    return !UserFriendlyError.isNetworkError(error);
  }

  isNetworkError() {
    return UserFriendlyError.isNetworkError(this);
  }

  notNetworkError() {
    return UserFriendlyError.notNetworkError(this);
  }
}
