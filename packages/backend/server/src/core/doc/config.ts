import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    doc: {
      history: {
        interval: number;
      };
    };
  }
}

defineModuleConfig('doc', {
  'history.interval': {
    desc: 'The minimum time interval in milliseconds of creating a new history snapshot when doc get updated.',
    default: 1000 * 60 * 10 /* 10 mins */,
  },
});
