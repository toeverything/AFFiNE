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

import {
  assertRspackSupportedPackageName,
  DEFAULT_DEV_SERVER_CONFIG,
} from './bundle-shared';
import { Option, PackageCommand } from './command';
import {
  createHTMLTargetConfig as createRspackHTMLTargetConfig,
  createNodeTargetConfig as createRspackNodeTargetConfig,
  createWorkerTargetConfig as createRspackWorkerTargetConfig,
} from './rspack';
import {
  shouldUploadReleaseAssets,
  uploadDistAssetsToS3,
} from './rspack-shared/s3-plugin.js';

type WorkerConfig = { name: string };
type CreateWorkerTargetConfig = (pkg: Package, entry: string) => WorkerConfig;
type BaseWorkerOptions = {
  includeMermaidAndTypst?: boolean;
};

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
  createWorkerTargetConfig: CreateWorkerTargetConfig,
  options: BaseWorkerOptions = {}
) {
  const core = new Package('@affine/core');
  const includeMermaidAndTypst = options.includeMermaidAndTypst ?? true;

  const workerConfigs = [
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

  if (includeMermaidAndTypst) {
    workerConfigs.push(
      createWorkerTargetConfig(
        pkg,
        core.srcPath.join('modules/mermaid/renderer/mermaid.worker.ts').value
      ),
      createWorkerTargetConfig(
        pkg,
        core.srcPath.join('modules/typst/renderer/typst.worker.ts').value
      )
    );
  }

  return workerConfigs;
}

function getRspackBundleConfigs(pkg: Package): MultiRspackOptions {
  assertRspackSupportedPackage(pkg);

  switch (pkg.name) {
    case '@affine/admin': {
      return [
        createRspackHTMLTargetConfig(pkg, pkg.srcPath.join('index.tsx').value, {
          selfhostPublicPath: '/admin/',
        }),
      ] as MultiRspackOptions;
    }
    case '@affine/web':
    case '@affine/mobile': {
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
    case '@affine/ios':
    case '@affine/android': {
      const workerConfigs = getBaseWorkerConfigs(
        pkg,
        createRspackWorkerTargetConfig,
        { includeMermaidAndTypst: false }
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
        createRspackWorkerTargetConfig,
        { includeMermaidAndTypst: false }
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
    case '@affine/reader': {
      return [
        createRspackNodeTargetConfig(pkg, pkg.srcPath.join('index.ts').value, {
          outputFilename: 'index.js',
          decoratorVersion: '2022-03',
          libraryType: 'module',
          bundleAllDependencies: true,
          forceExternal: ['yjs'],
        }),
      ] as MultiRspackOptions;
    }
  }

  throw new Error(`Unsupported package: ${pkg.name}`);
}

export class BundleCommand extends PackageCommand {
  static override paths = [['bundle'], ['pack'], ['bun']];

  // bundle is not able to run with deps
  override _deps = false;
  override waitDeps = false;

  dev = Option.Boolean('--dev,-d', false, {
    description: 'Run in Development mode',
  });

  async execute() {
    const pkg = this.workspace.getPackage(this.package);

    if (this.dev) {
      await BundleCommand.dev(pkg);
    } else {
      await BundleCommand.build(pkg);
    }
  }

  static async build(pkg: Package) {
    return BundleCommand.buildWithRspack(pkg);
  }

  static async dev(
    pkg: Package,
    devServerConfig?: RspackDevServerConfiguration
  ) {
    return BundleCommand.devWithRspack(pkg, devServerConfig);
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
