import { UserFriendlyError } from '@affine/error';
import { describe, expect, test } from 'vitest';

import {
  assertSupportedServerVersion,
  isBatchSyncServerVersion,
  MIN_SUPPORTED_SERVER_VERSION,
} from './server-config';

describe('server config version guard', () => {
  test.each([
    ['0.26.9', false],
    ['0.27.0', true],
    ['0.27.0-beta.1', true],
    ['2026.8.20-canary.15', true],
    ['0.28.0', true],
  ])('selects batch sync for %s', (version, expected) => {
    expect(isBatchSyncServerVersion(version)).toBe(expected);
  });

  test.each([
    ['0.27.0', true],
    ['0.27.0-beta.5', true],
    ['0.27.0-rc.1', true],
    ['0.28.0', true],
    ['0.26.9', false],
    ['0.26.9-beta.5', false],
    [undefined, false],
    [null, false],
    ['', false],
    ['not-a-version', false],
  ])('validates server version %s', (version, supported) => {
    if (supported) {
      expect(() => assertSupportedServerVersion(version)).not.toThrow();
    } else {
      expect(() => assertSupportedServerVersion(version)).toThrow(
        UserFriendlyError
      );
    }
  });

  test('reports the required server version', () => {
    expect.assertions(2);

    try {
      assertSupportedServerVersion('0.26.0');
    } catch (error) {
      const userFriendlyError = UserFriendlyError.fromAny(error);
      expect(userFriendlyError.name).toBe('UNSUPPORTED_SERVER_VERSION');
      expect(userFriendlyError.data).toMatchObject({
        requiredVersion: `>=${MIN_SUPPORTED_SERVER_VERSION}`,
        serverVersion: '0.26.0',
      });
    }
  });
});
