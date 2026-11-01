import path from 'node:path';

import { notarize } from '@electron/notarize';
import { signAsync } from '@electron/osx-sign';

import { arch, buildType, productName, ROOT } from './make-env.js';

const appPath = path.join(
  ROOT,
  'out',
  buildType,
  `${productName}-darwin-${arch}`,
  `${productName}.app`
);

const { APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID } = process.env;
if (!APPLE_ID || !APPLE_PASSWORD || !APPLE_TEAM_ID) {
  throw new Error(
    'APPLE_ID, APPLE_PASSWORD and APPLE_TEAM_ID are required for notarization'
  );
}

await signAsync({
  app: appPath,
  identity: 'Developer ID Application: TOEVERYTHING PTE. LTD.',
  optionsForFile: () => ({ hardenedRuntime: true }),
});
await notarize({
  appPath,
  appleId: APPLE_ID,
  appleIdPassword: APPLE_PASSWORD,
  teamId: APPLE_TEAM_ID,
});
