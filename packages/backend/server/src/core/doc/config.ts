import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    doc: {
      history: {
        interval: number;
      };
      experimental: {
        yocto: boolean;
      };
    };
  }
}

defineModuleConfig('doc', {
  'experimental.yocto': {
    desc: 'Use `y-octo` to merge updates at the same time when merging using Yjs.',
    default: false,
  },
  'history.interval': {
    desc: 'The minimum time interval in milliseconds of creating a new history snapshot when doc get updated.',
    default: 1000 * 60 * 10 /* 10 mins */,
  },
});
