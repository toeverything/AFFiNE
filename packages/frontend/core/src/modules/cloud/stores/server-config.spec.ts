import { UserFriendlyError } from '@affine/error';
import { describe, expect, test } from 'vitest';

import {
  assertSupportedServerVersion,
  getSyncProtocol,
  isBatchSyncServerVersion,
  MIN_SUPPORTED_SERVER_VERSION,
} from './server-config';

describe('server config version guard', () => {
  test('selects batch sync from server version', () => {
    expect(isBatchSyncServerVersion('0.27.4')).toBe(false);
    expect(isBatchSyncServerVersion('0.27.5')).toBe(true);
    expect(isBatchSyncServerVersion('0.27.5-beta.1')).toBe(true);
    expect(isBatchSyncServerVersion('2026.8.20-canary.15')).toBe(true);
    expect(isBatchSyncServerVersion('0.28.0')).toBe(true);
  });

  test('does not select a route before server version is verified', () => {
    expect(() => getSyncProtocol()).toThrow(UserFriendlyError);
    expect(() => getSyncProtocol('0.26.9')).toThrow(UserFriendlyError);
    expect(getSyncProtocol('0.27.4')).toBe('legacy');
    expect(getSyncProtocol('0.27.5')).toBe('batch');
  });

  test('accepts supported server versions', () => {
    expect(() => assertSupportedServerVersion('0.27.0')).not.toThrow();
    expect(() => assertSupportedServerVersion('0.27.0-beta.5')).not.toThrow();
    expect(() => assertSupportedServerVersion('0.27.0-rc.1')).not.toThrow();
    expect(() => assertSupportedServerVersion('0.28.0')).not.toThrow();
  });

  test('rejects old server versions', () => {
    for (const version of ['0.26.9', '0.26.9-beta.5']) {
      expect(() => assertSupportedServerVersion(version)).toThrow(
        UserFriendlyError
      );
    }
  });

  test('rejects missing or invalid server versions', () => {
    for (const version of [undefined, null, '', 'not-a-version']) {
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
