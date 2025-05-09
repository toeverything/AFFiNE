import { describe, expect, it } from 'vitest';

import { GraphQLError, UserFriendlyError } from '..';

describe('user friendly error', () => {
  it('should create from graphql error', () => {
    const gqlError = new GraphQLError('test', {
      extensions: {
        status: 400,
        code: 'BAD_REQUEST',
        type: 'BAD_REQUEST',
        name: 'SOME_ERROR_NAME',
        message: 'test',
      },
    });

    const error = UserFriendlyError.fromAny(gqlError);

    expect(error.name).toBe('SOME_ERROR_NAME');
    expect(error.status).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
    expect(error.type).toBe('BAD_REQUEST');
    expect(error.message).toBe('test');
  });

  it('should create from any error', () => {
    const error = UserFriendlyError.fromAny(new Error('test'));
    expect(error.message).toBe('test');
  });

  it('should create from object', () => {
    const error = UserFriendlyError.fromAny({
      name: 'SOME_ERROR_NAME',
      status: 400,
      code: 'BAD_REQUEST',
      type: 'BAD_REQUEST',
      message: 'test',
    });

    expect(error.message).toBe('test');
  });

  it('should create from string', () => {
    const error = UserFriendlyError.fromAny('test error');
    expect(error.message).toBe('test error');
  });

  it('should create fallback error', () => {
    const error = UserFriendlyError.fromAny(null);

    expect(error.message).toBe(
      'Unhandled error raised. Please contact us for help.'
    );
  });

  it('should test network error', () => {
    const error = UserFriendlyError.fromAny({
      name: 'NETWORK_ERROR',
      status: 500,
      code: 'INTERNAL_SERVER_ERROR',
      type: 'INTERNAL_SERVER_ERROR',
      message: 'test',
    });

    expect(error.isNetworkError()).toBe(true);

    const error2 = UserFriendlyError.fromAny({
      name: 'SOME_ERROR_NAME',
      status: 400,
      code: 'BAD_REQUEST',
      type: 'BAD_REQUEST',
      message: 'test',
    });

    expect(error2.isNetworkError()).toBe(false);
  });

  it('should test name', () => {
    const error = UserFriendlyError.fromAny({
      name: 'SOME_ERROR_NAME',
      status: 400,
      code: 'BAD_REQUEST',
      type: 'BAD_REQUEST',
      message: 'test',
    });

    // @ts-expect-error test name
    expect(error.is('SOME_ERROR_NAME')).toBe(true);
  });

  it('should test status', () => {
    const error = UserFriendlyError.fromAny({
      name: 'SOME_ERROR_NAME',
      status: 400,
      code: 'BAD_REQUEST',
      type: 'BAD_REQUEST',
      message: 'test',
    });

    expect(error.isStatus(400)).toBe(true);
  });
});
