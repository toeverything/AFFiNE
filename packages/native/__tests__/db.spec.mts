import test from 'ava';
import { fileURLToPath } from 'node:url';

import { SqliteConnection, ValidationResult } from '../index';

test('db validate', async t => {
  const path = fileURLToPath(
    new URL('./fixtures/test01.affine', import.meta.url)
  );
  const result = await SqliteConnection.validate(path);
  t.is(result, ValidationResult.MissingVersionColumn);
});
