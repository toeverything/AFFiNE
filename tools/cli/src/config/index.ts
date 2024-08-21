export type BuildFlags = {
  distribution: 'browser' | 'desktop' | 'admin' | 'mobile';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
  coverage?: boolean;
  localBlockSuite?: string;
  entry?: string | { [key: string]: string };
};
