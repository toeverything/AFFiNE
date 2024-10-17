import { fileURLToPath } from 'node:url';

import { expect, test } from 'vitest';

import { SqliteConnection, ValidationResult } from '../index';

test('db validate', async () => {
  const path = fileURLToPath(
    new URL('./fixtures/test01.affine', import.meta.url)
  );
  const result = await SqliteConnection.validate(path);
  expect(result).toBe(ValidationResult.MissingVersionColumn);
});
