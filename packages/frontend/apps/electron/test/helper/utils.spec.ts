import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  assertPathComponent,
  resolveExistingPathInBase,
  resolvePathInBase,
} from '../../src/shared/utils';

const tmpDir = path.join(os.tmpdir(), `affine-electron-utils-${randomUUID()}`);

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('path guards', () => {
  test('resolvePathInBase blocks sibling-prefix escapes', () => {
    const baseDir = path.join(tmpDir, 'recordings');

    expect(() =>
      resolvePathInBase(baseDir, '../recordings-evil/file.opus', {
        label: 'directory',
      })
    ).toThrow('Invalid directory');
  });

  test.runIf(process.platform !== 'win32')(
    'resolveExistingPathInBase rejects symlink escapes',
    async () => {
      const baseDir = path.join(tmpDir, 'recordings');
      const outsideDir = path.join(tmpDir, 'outside');
      const outsideFile = path.join(outsideDir, 'secret.txt');
      const linkPath = path.join(baseDir, '1234567890abcdef.blob');

      await fs.mkdir(baseDir, { recursive: true });
      await fs.mkdir(outsideDir, { recursive: true });
      await fs.writeFile(outsideFile, 'secret');
      await fs.symlink(outsideFile, linkPath);

      await expect(
        resolveExistingPathInBase(baseDir, linkPath, {
          label: 'recording filepath',
        })
      ).rejects.toThrow('Invalid recording filepath');
    }
  );

  test('assertPathComponent rejects traversal-like ids', () => {
    expect(() => assertPathComponent('../../escape', 'workspace id')).toThrow(
      'Invalid workspace id'
    );
    expect(() => assertPathComponent('nested/id', 'workspace id')).toThrow(
      'Invalid workspace id'
    );
  });
});
