import { defineModuleConfig } from '../config';

declare global {
  interface AppConfigSchema {
    crypto: {
      privateKey: string;
    };
  }
}

defineModuleConfig('crypto', {
  privateKey: {
    desc: 'The private key for used by the crypto module to create signed tokens or encrypt data.',
    env: 'AFFINE_PRIVATE_KEY',
    default: '',
    schema: { type: 'string' },
  },
});
