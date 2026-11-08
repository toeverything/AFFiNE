import { execFile } from 'node:child_process';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { promisify } from 'node:util';

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
try {
  await notarize({
    appPath,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_PASSWORD,
    teamId: APPLE_TEAM_ID,
  });
} catch (error) {
  if (
    !(error instanceof Error) ||
    !error.message.startsWith(
      'Failed to staple your application with code: 68'
    ) ||
    !error.message.includes('NSURLErrorDomain Code=-1005')
  ) {
    throw error;
  }

  // Apple accepted the submission. Retry ticket retrieval without resubmitting.
  const staple = promisify(execFile);
  for (const delay of [15_000, 45_000, 90_000]) {
    console.warn(`Stapling connection lost. Retrying in ${delay / 1000}s.`);
    await setTimeout(delay);
    try {
      await staple(
        'xcrun',
        ['stapler', 'staple', '-v', path.basename(appPath)],
        {
          cwd: path.dirname(appPath),
        }
      );
      break;
    } catch (retryError) {
      if (
        delay === 90_000 ||
        !(retryError instanceof Error) ||
        !String('stdout' in retryError ? retryError.stdout : '')
          .concat(retryError.message)
          .includes('NSURLErrorDomain Code=-1005')
      ) {
        throw retryError;
      }
    }
  }
}
