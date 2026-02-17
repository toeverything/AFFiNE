import { rmSync } from 'node:fs';
import { cpus } from 'node:os';

import { Logger } from '@affine-tools/utils/logger';
import { Package } from '@affine-tools/utils/workspace';
import rspack, { type MultiRspackOptions } from '@rspack/core';
import {
  type Configuration as RspackDevServerConfiguration,
  RspackDevServer,
} from '@rspack/dev-server';
import { merge } from 'lodash-es';
import webpack from 'webpack';
import WebpackDevServer, {
  type Configuration as WebpackDevServerConfiguration,
} from 'webpack-dev-server';

import {
  assertRspackSupportedPackageName,
  DEFAULT_DEV_SERVER_CONFIG,
  isRspackSupportedPackageName,
} from './bundle-shared';
import { type Bundler, getBundler } from './bundler';
import { Option, PackageCommand } from './command';
import {
  createHTMLTargetConfig as createRspackHTMLTargetConfig,
  createNodeTargetConfig as createRspackNodeTargetConfig,
  createWorkerTargetConfig as createRspackWorkerTargetConfig,
} from './rspack';
import {
  createHTMLTargetConfig as createWebpackHTMLTargetConfig,
  createNodeTargetConfig as createWebpackNodeTargetConfig,
  createWorkerTargetConfig as createWebpackWorkerTargetConfig,
} from './webpack';
import {
  shouldUploadReleaseAssets,
  uploadDistAssetsToS3,
} from './webpack/s3-plugin.js';

type WorkerConfig = { name: string };
type CreateWorkerTargetConfig = (pkg: Package, entry: string) => WorkerConfig;

function assertRspackSupportedPackage(pkg: Package) {
  assertRspackSupportedPackageName(pkg.name);
}

function shouldUploadAssetsForPackage(pkg: Package): boolean {
  return (
    !!process.env.R2_SECRET_ACCESS_KEY && shouldUploadReleaseAssets(pkg.name)
  );
}

async function uploadAssetsForPackage(pkg: Package, logger: Logger) {
  if (!shouldUploadAssetsForPackage(pkg)) {
    return;
  }
  logger.info('Uploading dist assets to R2...');
  await uploadDistAssetsToS3(pkg.distPath.value);
  logger.info('Uploaded dist assets to R2.');
}

function getBaseWorkerConfigs(
  pkg: Package,
  createWorkerTargetConfig: CreateWorkerTargetConfig
) {
  const core = new Package('@affine/core');

  return [
    createWorkerTargetConfig(
      pkg,
      core.srcPath.join(
        'modules/workspace-engine/impls/workspace-profile.worker.ts'
      ).value
    ),
    createWorkerTargetConfig(
      pkg,
      core.srcPath.join('modules/pdf/renderer/pdf.worker.ts').value
    ),
    createWorkerTargetConfig(
      pkg,
      core.srcPath.join(
        'blocksuite/view-extensions/turbo-renderer/turbo-painter.worker.ts'
      ).value
    ),
  ];
}

function getWebpackBundleConfigs(pkg: Package): webpack.MultiConfiguration {
  switch (pkg.name) {
    case '@affine/admin': {
      return [
        createWebpackHTMLTargetConfig(pkg, pkg.srcPath.join('index.tsx').value),
      ] as webpack.MultiConfiguration;
    }
    case '@affine/web':
    case '@affine/mobile':
    case '@affine/ios':
    case '@affine/android': {
      const workerConfigs = getBaseWorkerConfigs(
        pkg,
        createWebpackWorkerTargetConfig
      );
      workerConfigs.push(
        createWebpackWorkerTargetConfig(
          pkg,
          pkg.srcPath.join('nbstore.worker.ts').value
        )
      );

      return [
        createWebpackHTMLTargetConfig(
          pkg,
          pkg.srcPath.join('index.tsx').value,
          {},
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
      ] as webpack.MultiConfiguration;
    }
    case '@affine/electron-renderer': {
      const workerConfigs = getBaseWorkerConfigs(
        pkg,
        createWebpackWorkerTargetConfig
      );

      return [
        createWebpackHTMLTargetConfig(
          pkg,
          {
            index: pkg.srcPath.join('app/index.tsx').value,
            shell: pkg.srcPath.join('shell/index.tsx').value,
            popup: pkg.srcPath.join('popup/index.tsx').value,
            backgroundWorker: pkg.srcPath.join('background-worker/index.ts')
              .value,
          },
          {
            additionalEntryForSelfhost: false,
            injectGlobalErrorHandler: false,
            emitAssetsManifest: false,
          },
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
      ] as webpack.MultiConfiguration;
    }
    case '@affine/server': {
      return [
        createWebpackNodeTargetConfig(pkg, pkg.srcPath.join('index.ts').value),
      ] as webpack.MultiConfiguration;
    }
  }

  throw new Error(`Unsupported package: ${pkg.name}`);
}

function getRspackBundleConfigs(pkg: Package): MultiRspackOptions {
  assertRspackSupportedPackage(pkg);

  switch (pkg.name) {
    case '@affine/admin': {
      return [
        createRspackHTMLTargetConfig(pkg, pkg.srcPath.join('index.tsx').value),
      ] as MultiRspackOptions;
    }
    case '@affine/web':
    case '@affine/mobile':
    case '@affine/ios':
    case '@affine/android': {
      const workerConfigs = getBaseWorkerConfigs(
        pkg,
        createRspackWorkerTargetConfig
      );
      workerConfigs.push(
        createRspackWorkerTargetConfig(
          pkg,
          pkg.srcPath.join('nbstore.worker.ts').value
        )
      );

      return [
        createRspackHTMLTargetConfig(
          pkg,
          pkg.srcPath.join('index.tsx').value,
          {},
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
      ] as MultiRspackOptions;
    }
    case '@affine/electron-renderer': {
      const workerConfigs = getBaseWorkerConfigs(
        pkg,
        createRspackWorkerTargetConfig
      );

      return [
        createRspackHTMLTargetConfig(
          pkg,
          {
            index: pkg.srcPath.join('app/index.tsx').value,
            shell: pkg.srcPath.join('shell/index.tsx').value,
            popup: pkg.srcPath.join('popup/index.tsx').value,
            backgroundWorker: pkg.srcPath.join('background-worker/index.ts')
              .value,
          },
          {
            additionalEntryForSelfhost: false,
            injectGlobalErrorHandler: false,
            emitAssetsManifest: false,
          },
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
      ] as MultiRspackOptions;
    }
    case '@affine/server': {
      return [
        createRspackNodeTargetConfig(pkg, pkg.srcPath.join('index.ts').value),
      ] as MultiRspackOptions;
    }
  }

  throw new Error(`Unsupported package: ${pkg.name}`);
}

export class BundleCommand extends PackageCommand {
  static override paths = [['bundle'], ['webpack'], ['pack'], ['bun']];

  // bundle is not able to run with deps
  override _deps = false;
  override waitDeps = false;

  dev = Option.Boolean('--dev,-d', false, {
    description: 'Run in Development mode',
  });

  async execute() {
    const pkg = this.workspace.getPackage(this.package);
    const bundler = getBundler();

    if (this.dev) {
      await BundleCommand.dev(pkg, bundler);
    } else {
      await BundleCommand.build(pkg, bundler);
    }
  }

  static async build(pkg: Package, bundler: Bundler = getBundler()) {
    if (bundler === 'rspack' && !isRspackSupportedPackageName(pkg.name)) {
      return BundleCommand.buildWithWebpack(pkg);
    }

    switch (bundler) {
      case 'webpack':
        return BundleCommand.buildWithWebpack(pkg);
      case 'rspack':
        return BundleCommand.buildWithRspack(pkg);
    }
  }

  static async buildWithWebpack(pkg: Package) {
    process.env.NODE_ENV = 'production';
    const logger = new Logger('bundle');
    logger.info(`Packing package ${pkg.name} with webpack...`);
    logger.info('Cleaning old output...');
    rmSync(pkg.distPath.value, { recursive: true, force: true });

    const config = getWebpackBundleConfigs(pkg);
    config.parallelism = cpus().length;

    const compiler = webpack(config);
    if (!compiler) {
      throw new Error('Failed to create webpack compiler');
    }

    try {
      const stats = await new Promise<webpack.Stats | webpack.MultiStats>(
        (resolve, reject) => {
          compiler.run((error, stats) => {
            if (error) {
              reject(error);
              return;
            }
            if (!stats) {
              reject(new Error('Failed to get webpack stats'));
              return;
            }
            resolve(stats);
          });
        }
      );
      if (stats.hasErrors()) {
        console.error(stats.toString('errors-only'));
        process.exit(1);
        return;
      }
      console.log(stats.toString('minimal'));
      await uploadAssetsForPackage(pkg, logger);
    } catch (error) {
      console.error(error);
      process.exit(1);
      return;
    }
  }

  static async dev(
    pkg: Package,
    bundler: Bundler = getBundler(),
    devServerConfig?:
      | WebpackDevServerConfiguration
      | RspackDevServerConfiguration
  ) {
    if (bundler === 'rspack' && !isRspackSupportedPackageName(pkg.name)) {
      return BundleCommand.devWithWebpack(
        pkg,
        devServerConfig as WebpackDevServerConfiguration | undefined
      );
    }

    switch (bundler) {
      case 'webpack':
        return BundleCommand.devWithWebpack(
          pkg,
          devServerConfig as WebpackDevServerConfiguration | undefined
        );
      case 'rspack':
        return BundleCommand.devWithRspack(
          pkg,
          devServerConfig as RspackDevServerConfiguration | undefined
        );
    }
  }

  static async devWithWebpack(
    pkg: Package,
    devServerConfig?: WebpackDevServerConfiguration
  ) {
    process.env.NODE_ENV = 'development';
    const logger = new Logger('bundle');
    logger.info(`Starting webpack dev server for ${pkg.name}...`);

    const config = getWebpackBundleConfigs(pkg);
    config.parallelism = cpus().length;

    const compiler = webpack(config);
    if (!compiler) {
      throw new Error('Failed to create webpack compiler');
    }

    const devServer = new WebpackDevServer(
      merge({}, DEFAULT_DEV_SERVER_CONFIG, devServerConfig),
      compiler
    );

    await devServer.start();
  }

  static async buildWithRspack(pkg: Package) {
    process.env.NODE_ENV = 'production';
    assertRspackSupportedPackage(pkg);

    const logger = new Logger('bundle');
    logger.info(`Packing package ${pkg.name} with rspack...`);
    logger.info('Cleaning old output...');
    rmSync(pkg.distPath.value, { recursive: true, force: true });

    const config = getRspackBundleConfigs(pkg);
    config.parallelism = cpus().length;

    const compiler = rspack(config);
    if (!compiler) {
      throw new Error('Failed to create rspack compiler');
    }

    try {
      const stats = await new Promise<any>((resolve, reject) => {
        compiler.run((error, stats) => {
          if (error) {
            reject(error);
            return;
          }
          if (!stats) {
            reject(new Error('Failed to get rspack stats'));
            return;
          }
          resolve(stats);
        });
      });
      if (stats.hasErrors()) {
        console.error(stats.toString('errors-only'));
        process.exit(1);
        return;
      }
      console.log(stats.toString('minimal'));
      await uploadAssetsForPackage(pkg, logger);
    } catch (error) {
      console.error(error);
      process.exit(1);
      return;
    }
  }

  static async devWithRspack(
    pkg: Package,
    devServerConfig?: RspackDevServerConfiguration
  ) {
    process.env.NODE_ENV = 'development';
    assertRspackSupportedPackage(pkg);

    const logger = new Logger('bundle');
    logger.info(`Starting rspack dev server for ${pkg.name}...`);

    const config = getRspackBundleConfigs(pkg);
    config.parallelism = cpus().length;

    const compiler = rspack(config);
    if (!compiler) {
      throw new Error('Failed to create rspack compiler');
    }

    const devServer = new RspackDevServer(
      merge({}, DEFAULT_DEV_SERVER_CONFIG, devServerConfig),
      compiler
    );

    await devServer.start();
  }
}
