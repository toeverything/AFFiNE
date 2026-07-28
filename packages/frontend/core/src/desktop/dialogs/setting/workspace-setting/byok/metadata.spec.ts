import { describe, expect, test } from 'vitest';

import { endpointHintKey, shouldShowEndpoint } from './metadata';

describe('endpointHintKey', () => {
  test.each([
    [false, false, 'endpoint.custom-disabled'],
    [true, false, 'endpoint.private-disabled'],
    [true, true, null],
  ] as const)(
    'maps custom=%s private=%s to %s',
    (customEndpointSupported, privateEndpointSupported, expected) => {
      expect(
        endpointHintKey(customEndpointSupported, privateEndpointSupported)
      ).toBe(expected);
    }
  );
});

describe('shouldShowEndpoint', () => {
  test.each([
    [true, false, true],
    [true, true, true],
    [false, true, true],
    [false, false, false],
  ])(
    'self-hosted %s with custom endpoint support %s returns %s',
    (isSelfHosted, customEndpointSupported, expected) => {
      expect(shouldShowEndpoint(isSelfHosted, customEndpointSupported)).toBe(
        expected
      );
    }
  );
});
