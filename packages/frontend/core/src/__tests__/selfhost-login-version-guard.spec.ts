import { describe, expect, test } from 'vitest';

import { isServerVersionBelowRequirement } from '../components/hooks/affine/use-selfhost-login-version-guard';

describe('isServerVersionBelowRequirement', () => {
  test('accepts canary prerelease identifiers with leading zeroes', () => {
    expect(
      isServerVersionBelowRequirement('0.26.3-canary.0584193', '0.23.0')
    ).toBe(false);
  });

  test('still detects genuinely outdated versions', () => {
    expect(isServerVersionBelowRequirement('0.22.9', '0.23.0')).toBe(true);
  });

  test('treats unparsable versions as non-blocking', () => {
    expect(isServerVersionBelowRequirement('not-a-version', '0.23.0')).toBe(
      false
    );
  });
});
