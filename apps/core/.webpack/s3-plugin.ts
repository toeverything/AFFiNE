import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

import type { PutObjectCommandInput } from '@aws-sdk/client-s3';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { once } from 'lodash-es';
import { lookup } from 'mime-types';
import type { Compiler, WebpackPluginInstance } from 'webpack';

export const gitShortHash = once(() => {
  const { GITHUB_SHA } = process.env;
  if (GITHUB_SHA) {
    return GITHUB_SHA.substring(0, 9);
  }
  const sha = execSync(`git rev-parse --short HEAD`, {
    encoding: 'utf-8',
  }).trim();
  return sha;
});

export const R2_BUCKET =
  process.env.R2_BUCKET! ??
  (process.env.BUILD_TYPE === 'canary' ? 'assets-dev' : 'assets-prod');

export class WebpackS3Plugin implements WebpackPluginInstance {
  private readonly s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tapPromise(
      'WebpackS3Plugin',
      async (asset, { outputPath }) => {
        if (asset === 'index.html') {
          return;
        }
        const assetPath = join(outputPath, asset);
        const assetSource = await readFile(assetPath);
        const putObjectCommandOptions: PutObjectCommandInput = {
          Body: assetSource,
          Bucket: R2_BUCKET,
          Key: join(gitShortHash(), asset),
        };
        const contentType = lookup(asset);
        if (contentType) {
          putObjectCommandOptions.ContentType = contentType;
        }
        await this.s3.send(new PutObjectCommand(putObjectCommandOptions));
      }
    );
  }
}
