export type BuildFlags = {
  distribution: 'browser' | 'desktop';
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary';
};
