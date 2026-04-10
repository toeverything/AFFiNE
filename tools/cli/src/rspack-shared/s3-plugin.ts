import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

import { createS3CompatClient } from '@affine/s3-compat';
import { lookup } from 'mime-types';

export const R2_BUCKET =
  process.env.R2_BUCKET ??
  (process.env.BUILD_TYPE === 'canary' ? 'assets-dev' : 'assets-prod');

const S3_UPLOAD_PACKAGE_NAMES = new Set([
  '@affine/web',
  '@affine/mobile',
  '@affine/admin',
]);
const MAX_UPLOAD_RETRIES = 3;
const UPLOAD_RETRY_BASE_DELAY_MS = 500;

function createR2Client() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    throw new Error('Missing R2 credentials for uploading release assets');
  }

  return createS3CompatClient(
    {
      region: 'auto',
      bucket: R2_BUCKET,
      forcePathStyle: true,
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    },
    {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    }
  );
}

async function collectFiles(dir: string): Promise<string[]> {
  const dirs = [dir];
  const files: string[] = [];

  while (dirs.length > 0) {
    const current = dirs.pop()!;
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        dirs.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

function toAssetKey(outputPath: string, filePath: string): string {
  return relative(outputPath, filePath).split(sep).join('/');
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function putObjectWithRetry(
  s3: ReturnType<typeof createR2Client>,
  asset: string,
  assetSource: Buffer,
  contentType: string | false | undefined
) {
  let retries = 0;
  while (true) {
    try {
      await s3.putObject(asset, assetSource, {
        contentType: contentType || undefined,
        contentLength: assetSource.byteLength,
      });
      return;
    } catch (error) {
      if (retries >= MAX_UPLOAD_RETRIES) {
        throw error;
      }
      retries += 1;
      const delay = UPLOAD_RETRY_BASE_DELAY_MS * 2 ** (retries - 1);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.warn(
        `[s3-upload] Retry ${retries}/${MAX_UPLOAD_RETRIES} for ${asset}: ${errorMessage}`
      );
      await sleep(delay);
    }
  }
}

async function runInParallel<T>(
  values: T[],
  worker: (value: T) => Promise<void>,
  concurrency = 16
) {
  if (values.length === 0) {
    return;
  }
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= values.length) {
          return;
        }
        await worker(values[index]!);
      }
    }
  );

  await Promise.all(workers);
}

export function shouldUploadReleaseAssets(pkgName: string): boolean {
  return S3_UPLOAD_PACKAGE_NAMES.has(pkgName);
}

export async function uploadDistAssetsToS3(outputPath: string) {
  const allFiles = await collectFiles(outputPath);
  const uploadFiles = allFiles.filter(file => !file.endsWith('.html'));

  if (uploadFiles.length === 0) {
    return;
  }

  const s3 = createR2Client();
  await runInParallel(uploadFiles, async filePath => {
    const asset = toAssetKey(outputPath, filePath);
    const assetSource = await readFile(filePath);
    const contentType = lookup(asset);
    await putObjectWithRetry(s3, asset, assetSource, contentType);
  });
}
