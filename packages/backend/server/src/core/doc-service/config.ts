import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    docService: {
      endpoint: string;
    };
  }
}

defineModuleConfig('docService', {
  endpoint: {
    desc: 'The endpoint of the doc service.',
    default: '',
    env: 'DOC_SERVICE_ENDPOINT',
  },
});
