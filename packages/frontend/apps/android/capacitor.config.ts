import { join } from 'node:path';

import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.affine.pro',
  appName: 'AFFiNE',
  webDir: 'dist',
  android: {
    path: 'App',
    buildOptions: {
      keystorePath: join(__dirname, 'affine.keystore'),
      keystorePassword: process.env.AFFINE_ANDROID_KEYSTORE_PASSWORD,
      keystoreAlias: 'key0',
      keystoreAliasPassword: process.env.AFFINE_ANDROID_KEYSTORE_ALIAS_PASSWORD,
      releaseType: 'AAB',
    },
  },
};

export default config;
