import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { Package } from '@affine-tools/utils/workspace';
import {
  androidpublisher_v3,
  auth as google_auth,
} from '@googleapis/androidpublisher';

const packageName = 'app.affine.pro';
const auth = new google_auth.GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});
const publisher = new androidpublisher_v3.Androidpublisher({ auth });

async function createEdit(applicationId: string) {
  const response = await publisher.edits.insert({ packageName: applicationId });
  if (!response.data.id) {
    throw new Error('Google Play returned no edit ID');
  }
  return response.data.id;
}

export async function fetchVersionCode(applicationId: string): Promise<number> {
  const editId = await createEdit(applicationId);
  const response = await publisher.edits.bundles.list({
    packageName: applicationId,
    editId,
  });
  await publisher.edits.delete({ packageName: applicationId, editId });
  return Math.max(
    1,
    ...(response.data.bundles ?? []).map(bundle => bundle.versionCode ?? 0)
  );
}

async function bump() {
  const gradlePath = new Package('@affine/android').join(
    'App/app/build.gradle'
  ).value;
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const pattern = /(versionCode(?:\s|=)*)(\d+)/;
  const local = Number(gradle.match(pattern)?.[2] ?? 0);
  const versionCode = Math.max(local, await fetchVersionCode(packageName)) + 1;
  fs.writeFileSync(gradlePath, gradle.replace(pattern, `$1${versionCode}`));
  fs.writeFileSync(
    process.env.STORE_BUILD_METADATA ?? 'store-build.json',
    JSON.stringify({ packageName, versionCode })
  );
}

async function submit() {
  const metadata = process.env.STORE_BUILD_METADATA;
  const bundle = process.env.STORE_BUNDLE;
  const receipt = process.env.STORE_RECEIPT;
  if (!metadata || !bundle || !receipt) {
    throw new Error(
      'STORE_BUILD_METADATA, STORE_BUNDLE and STORE_RECEIPT are required'
    );
  }
  const operation = {
    operationRunId: Number(process.env.STORE_OPERATION_RUN_ID),
    operationAttempt: Number(process.env.STORE_OPERATION_ATTEMPT),
  };
  if (
    !Number.isSafeInteger(operation.operationRunId) ||
    operation.operationRunId <= 0 ||
    !Number.isSafeInteger(operation.operationAttempt) ||
    operation.operationAttempt <= 0
  ) {
    throw new Error(
      'A positive store operation run ID and attempt are required'
    );
  }
  const candidate: { packageName: string; versionCode: number } = JSON.parse(
    fs.readFileSync(metadata, 'utf8')
  );
  if (
    candidate.packageName !== packageName ||
    !Number.isSafeInteger(candidate.versionCode)
  ) {
    throw new Error('Invalid Google Play candidate metadata');
  }
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(bundle)) {
    hash.update(chunk);
  }
  const digest = hash.digest('hex');
  const editId = await createEdit(packageName);
  const tracks = await publisher.edits.tracks.list({ packageName, editId });
  const uploaded = await publisher.edits.bundles.list({ packageName, editId });
  const existing = uploaded.data.bundles?.find(
    item => item.versionCode === candidate.versionCode
  );
  const onTrack = tracks.data.tracks?.some(track =>
    track.releases?.some(release =>
      release.versionCodes?.includes(String(candidate.versionCode))
    )
  );
  if ((onTrack || existing) && !existing?.sha256) {
    await publisher.edits.delete({ packageName, editId });
    throw new Error('Google Play version has no verifiable bundle digest');
  }
  const conflict = existing && existing.sha256 !== digest;
  const submitted = onTrack && !conflict;
  const queryOnly = process.env.STORE_QUERY_ONLY === '1';
  if (queryOnly || submitted || conflict) {
    await publisher.edits.delete({ packageName, editId });
    if (conflict && !queryOnly) {
      throw new Error('Google Play version code belongs to a different bundle');
    }
    if (
      queryOnly &&
      !submitted &&
      !conflict &&
      process.env.STORE_ALLOW_ABSENT !== '1'
    ) {
      throw new Error(
        'No visible store result; the previous submission step ran, so its result remains unresolved'
      );
    }
  } else {
    if (!existing) {
      const result = await publisher.edits.bundles.upload({
        packageName,
        editId,
        media: {
          mimeType: 'application/octet-stream',
          body: fs.createReadStream(bundle),
        },
      });
      if (
        result.data.versionCode !== candidate.versionCode ||
        result.data.sha256 !== digest
      ) {
        throw new Error(
          'Uploaded bundle does not match the prepared candidate'
        );
      }
    }
    await publisher.edits.tracks.update({
      packageName,
      editId,
      track: 'internal',
      requestBody: {
        releases: [
          { status: 'draft', versionCodes: [String(candidate.versionCode)] },
        ],
      },
    });
    await publisher.edits.commit({ packageName, editId });
  }
  fs.writeFileSync(
    receipt,
    JSON.stringify({
      ...candidate,
      ...operation,
      store: 'google-play',
      status: !queryOnly || submitted ? 'submitted' : 'not-submitted',
    })
  );
}

if (process.argv.includes('submit')) {
  await submit();
} else {
  await bump();
}
