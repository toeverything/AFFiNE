import { defineModuleConfig } from '../../base';

declare global {
  interface AppConfigSchema {
    customerIo: {
      enabled: boolean;
      token: string;
    };
  }
}

defineModuleConfig('customerIo', {
  enabled: {
    desc: 'Enable customer.io integration',
    default: false,
  },
  token: {
    desc: 'Customer.io token',
    default: '',
    schema: { type: 'string' },
  },
});
