import { createHash } from 'node:crypto';
import type { BuildFlags } from '@affine/cli/config';

export function hash(content: string): string {
  const hash = createHash('sha512');
  hash.update(content);
  const pkgHash = hash.digest('hex');
  return pkgHash.substring(0, 8);
}

export function computeCacheKey(buildFlags: BuildFlags) {
  return [
    '1',
    'node' + process.version,
    buildFlags.mode,
    buildFlags.distribution,
  ].join('-');
}
