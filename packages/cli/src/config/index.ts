import { fileURLToPath } from 'node:url';

export type BuildFlags = {
  distribution: 'browser' | 'desktop';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
  coverage?: boolean;
};

export const projectRoot = fileURLToPath(
  new URL('../../../../', import.meta.url)
);
