export type BuildFlags = {
  distribution: 'web' | 'desktop' | 'admin' | 'mobile' | 'ios' | 'android';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
  static: boolean;
  coverage?: boolean;
  localBlockSuite?: string;
  entry?: string | { [key: string]: string };
};
