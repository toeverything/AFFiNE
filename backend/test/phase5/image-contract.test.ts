import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const backendRoot = resolve(here, '../..');
const repoRoot = resolve(backendRoot, '..');

function read(relativeFromRepo: string): string {
  return readFileSync(resolve(repoRoot, relativeFromRepo), 'utf8');
}

function lastStage(dockerfile: string): string {
  const matches = [...dockerfile.matchAll(/^FROM\s+\S+/gm)];
  const last = matches.at(-1);
  if (!last || last.index === undefined) {
    throw new Error('Dockerfile has no FROM instruction');
  }
  return dockerfile.slice(last.index);
}

function runtimeCopies(stage: string): string[] {
  return stage
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('COPY '));
}

const RUNTIME_IMAGES = [
  'Dockerfile',
  'Dockerfile.from-source',
  '.github/deployment/node/Dockerfile',
  'backend/Dockerfile',
] as const;

describe('Phase 5 — production images without EE', () => {
  it('runtime stages do not COPY packages/backend or wrap the AFFiNE EE image', () => {
    for (const file of RUNTIME_IMAGES) {
      const text = read(file);
      expect(text, file).not.toMatch(/FROM\s+ghcr\.io\/toeverything\/affine/);
      const stage = lastStage(text);
      for (const copy of runtimeCopies(stage)) {
        expect(copy, `${file} runtime COPY`).not.toMatch(/packages\/backend/);
        expect(copy, `${file} runtime COPY`).not.toMatch(/@affine\/server/);
      }
      expect(stage, file).not.toContain('prisma generate');
      expect(stage, file).not.toMatch(
        /node\s+\.\/scripts\/self-host-predeploy/
      );
      expect(stage, file).toMatch(
        /CMD\s+\[\"node\",\s*\"(?:\.\/)?dist\/main\.js\"\]/
      );
    }
  });

  it('from-source bakes MOSAIC_SERVER=1 and guards against EE leaking into /app', () => {
    const text = read('Dockerfile.from-source');
    expect(text).toMatch(/MOSAIC_SERVER=1/);
    expect(text).toContain('yarn affine @affine/web build');
    expect(text).not.toContain('yarn workspace @affine/server build');
    expect(lastStage(text)).toContain('test ! -d /app/packages/backend');
    expect(lastStage(text)).toContain('MOSAIC_STATIC_DIR=/app/static');
  });

  it('root compose cutover no longer runs EE predeploy', () => {
    const compose = read('docker-compose.yml')
      .split(/\r?\n/)
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');
    expect(compose).toContain('Dockerfile.from-source');
    expect(compose).not.toContain('self-host-predeploy');
    expect(compose).not.toContain('packages/backend');
    expect(compose).toContain('MOSAIC_STATIC_DIR: /app/static');
    expect(compose).toContain("MOSAIC_SERVER: '1'");

    const ee = read('docker-compose.ee.yml');
    expect(ee).toContain('self-host-predeploy');
  });
});
