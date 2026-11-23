import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, test } from 'vitest';

import {
  assertPathComponent,
  normalizeWorkspaceIdForPath,
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

  test('resolveExistingPathInBase falls back for missing descendants', async () => {
    const baseDir = path.join(tmpDir, 'recordings');

    await fs.mkdir(baseDir, { recursive: true });
    const missingPath = path.join(
      await fs.realpath(baseDir),
      'pending',
      'recording.opus'
    );

    await expect(
      resolveExistingPathInBase(baseDir, missingPath, {
        label: 'recording filepath',
      })
    ).resolves.toBe(path.resolve(missingPath));
  });

  test.runIf(process.platform !== 'win32')(
    'resolveExistingPathInBase preserves non-missing realpath errors',
    async () => {
      const baseDir = path.join(tmpDir, 'recordings');
      const loopPath = path.join(baseDir, 'loop.opus');

      await fs.mkdir(baseDir, { recursive: true });
      await fs.symlink(path.basename(loopPath), loopPath);

      await expect(
        resolveExistingPathInBase(baseDir, loopPath, {
          label: 'recording filepath',
        })
      ).rejects.toMatchObject({ code: 'ELOOP' });
    }
  );

  test.each(['../../escape', 'nested/id'])(
    'assertPathComponent rejects invalid workspace id %s',
    input => {
      expect(() => assertPathComponent(input, 'workspace id')).toThrow(
        'Invalid workspace id'
      );
    }
  );

  test.each([
    { input: 'legacy:id*with?reserved.', expected: 'legacy_id_with_reserved' },
    { input: 'safe-workspace', expected: 'safe-workspace' },
  ])(
    'normalizeWorkspaceIdForPath maps $input to $expected on Windows',
    ({ input, expected }) => {
      expect(normalizeWorkspaceIdForPath(input, { windows: true })).toBe(
        expected
      );
    }
  );
});
