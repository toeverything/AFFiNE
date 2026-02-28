export interface BuildFlags {
  mode: 'development' | 'production';
  channel: 'stable' | 'beta' | 'canary' | 'internal';
}
