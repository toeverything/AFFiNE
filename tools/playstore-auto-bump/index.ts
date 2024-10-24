import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  androidpublisher_v3,
  auth as google_auth,
} from '@googleapis/androidpublisher';

export async function fetchVersionCode(applicationId: string): Promise<number> {
  const auth = new google_auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
  });
  const androidPublisher = new androidpublisher_v3.Androidpublisher({
    auth,
  });
  const appEdit = await androidPublisher.edits.insert({
    packageName: applicationId,
    requestBody: {
      // 20min
      expiryTimeSeconds: (Math.floor(Date.now() / 1000) + 12000).toString(),
    },
  });

  if (!appEdit.data.id) {
    throw new Error('Failed to create edit');
  }

  const lists = await androidPublisher.edits.bundles.list({
    packageName: applicationId,
    editId: appEdit.data.id,
  });

  let versionCode: number = 1;
  try {
    versionCode =
      lists.data.bundles?.[lists.data.bundles.length - 1].versionCode || 1;
  } catch {}

  console.info(`Remote version code: ${versionCode}`);

  console.info(`Writing edit ID to ${process.env.GITHUB_OUTPUT}`);

  if (process.env.GITHUB_OUTPUT) {
    execSync(
      `echo "EDIT_ID=${appEdit.data.id}" >> ${process.env.GITHUB_OUTPUT}`,
      {
        stdio: 'inherit',
      }
    );
  }

  return versionCode;
}

const versionCodeRegexPattern = /(versionCode(?:\s|=)*)(.*)/;
const gradlePath = join(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  'packages/frontend/apps/android/App/app/build.gradle'
);

let gradleVersionCode = 0;

const gradleFile = fs.readFileSync(gradlePath, 'utf8');
const matched = gradleFile.match(versionCodeRegexPattern);

const remoteVersion = await fetchVersionCode('app.affine.pro');

gradleVersionCode = parseInt(matched?.[2] || '0');
gradleVersionCode = isNaN(gradleVersionCode) ? 0 : gradleVersionCode;
const versionCode = Math.max(gradleVersionCode, remoteVersion) + 1;

fs.writeFileSync(
  gradlePath,
  gradleFile.replace(versionCodeRegexPattern, `$1 ${versionCode}`)
);
