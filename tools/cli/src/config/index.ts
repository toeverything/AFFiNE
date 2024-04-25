import { fileURLToPath } from 'node:url';

export type BuildFlags = {
  distribution: 'browser' | 'desktop' | 'ios-bridge';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
  coverage?: boolean;
  localBlockSuite?: string;
  entry?: string;
};

export const projectRoot = fileURLToPath(
  new URL('../../../../', import.meta.url)
);
