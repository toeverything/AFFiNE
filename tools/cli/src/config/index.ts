export type BuildFlags = {
  distribution: 'browser' | 'desktop' | 'admin' | 'ios-bridge';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
  coverage?: boolean;
  localBlockSuite?: string;
  entry?: string | { [key: string]: string };
};
