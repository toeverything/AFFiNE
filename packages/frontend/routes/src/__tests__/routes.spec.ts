import { describe, expect, it } from 'vitest';

import { FACTORIES } from '../routes';

describe('PATH_FACTORIES', () => {
  it('should generate correct paths', () => {
    expect(
      FACTORIES.admin.settings.module({
        module: 'auth',
      })
    ).toBe('/admin/settings/auth');
  });
});
