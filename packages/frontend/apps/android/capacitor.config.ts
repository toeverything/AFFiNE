import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { CapacitorConfig } from '@capacitor/cli';

const packageJson = JSON.parse(
  readFileSync(resolve(__dirname, './package.json'), 'utf-8')
);

const capServerUrl = process.env.CAP_SERVER_URL;
const allowsCleartextServer = capServerUrl?.startsWith('http://') ?? false;

interface AppConfig {
  affineVersion: string;
}

const config: CapacitorConfig & AppConfig = {
  appId: 'app.affine.pro',
  appName: 'AFFiNE',
  webDir: 'dist',
  affineVersion: packageJson.version,
  android: {
    path: 'App',
    buildOptions: {
      keystorePath: join(__dirname, 'affine.keystore'),
      keystorePassword: process.env.AFFINE_ANDROID_KEYSTORE_PASSWORD,
      keystoreAlias: 'key0',
      keystoreAliasPassword: process.env.AFFINE_ANDROID_KEYSTORE_ALIAS_PASSWORD,
      releaseType: 'AAB',
    },
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    CapacitorCookies: {
      enabled: false,
    },
  },
};

if (capServerUrl) {
  Object.assign(config, {
    server: {
      url: capServerUrl,
      cleartext: allowsCleartextServer,
    },
  });
}

export default config;
