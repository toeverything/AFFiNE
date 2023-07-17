import { createHash } from 'node:crypto';

export function hash(content: string): string {
  const hash = createHash('sha512');
  hash.update(content);
  const pkgHash = hash.digest('hex');
  return pkgHash.substring(0, 8);
}
