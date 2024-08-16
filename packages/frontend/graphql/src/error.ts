import { GraphQLError as BaseGraphQLError } from 'graphql';

import { type ErrorDataUnion, ErrorNames } from './schema';

export interface UserFriendlyErrorResponse {
  status: number;
  code: string;
  type: string;
  name: ErrorNames;
  message: string;
  args?: any;
  stacktrace?: string;
}

export class UserFriendlyError implements UserFriendlyErrorResponse {
  status = this.response.status;
  code = this.response.code;
  type = this.response.type;
  name = this.response.name;
  message = this.response.message;
  args = this.response.args;
  stacktrace = this.response.stacktrace;

  static fromAnyError(response: any) {
    if (response instanceof GraphQLError) {
      return new UserFriendlyError(response.extensions);
    }

    if (
      'originError' in response &&
      response.originError instanceof UserFriendlyError
    ) {
      return response.originError as UserFriendlyError;
    }

    if (
      response &&
      typeof response === 'object' &&
      response.type &&
      response.name
    ) {
      return new UserFriendlyError(response);
    }

    return new UserFriendlyError({
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      type: 'INTERNAL_SERVER_ERROR',
      name: ErrorNames.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    });
  }

  constructor(private readonly response: UserFriendlyErrorResponse) {}
}

export class GraphQLError extends BaseGraphQLError {
  // @ts-expect-error better to be a known type without any type casting
  override extensions!: UserFriendlyErrorResponse;
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
