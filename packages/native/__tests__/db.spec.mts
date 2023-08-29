import assert from 'node:assert';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SqliteConnection, ValidationResult } from '../index';

test('db', { concurrency: false }, async t => {
  await t.test('validate', async () => {
    const path = fileURLToPath(
      new URL('./fixtures/test01.affine', import.meta.url)
    );
    const result = await SqliteConnection.validate(path);
    assert.equal(result, ValidationResult.MissingVersionColumn);
  });
});
