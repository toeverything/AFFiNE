import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { createS3CompatClient } from '@affine/s3-compat';
import { lookup } from 'mime-types';
import type { Compiler, WebpackPluginInstance } from 'webpack';

export const R2_BUCKET =
  process.env.R2_BUCKET ??
  (process.env.BUILD_TYPE === 'canary' ? 'assets-dev' : 'assets-prod');

export class WebpackS3Plugin implements WebpackPluginInstance {
  private readonly s3 = createS3CompatClient(
    {
      region: 'auto',
      bucket: R2_BUCKET,
      forcePathStyle: true,
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    },
    {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    }
  );

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tapPromise(
      'WebpackS3Plugin',
      async (asset, { outputPath }) => {
        if (asset.endsWith('.html')) {
          return;
        }
        const assetPath = join(outputPath, asset);
        const assetSource = await readFile(assetPath);
        const contentType = lookup(asset) || undefined;
        await this.s3.putObject(asset, assetSource, {
          contentType,
          contentLength: assetSource.byteLength,
        });
      }
    );
  }
}
