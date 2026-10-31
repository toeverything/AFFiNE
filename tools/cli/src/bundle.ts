import { createHash } from 'node:crypto';
import { readFileSync, rmSync, statSync } from 'node:fs';
import { cpus } from 'node:os';

import { Logger } from '@affine-tools/utils/logger';
import { Package } from '@affine-tools/utils/workspace';
import rspack, { type MultiRspackOptions } from '@rspack/core';
import {
  type Configuration as RspackDevServerConfiguration,
  RspackDevServer,
} from '@rspack/dev-server';
import { merge } from 'lodash-es';
import { injectManifest } from 'workbox-build';

import {
  assertRspackSupportedPackageName,
  DEFAULT_DEV_SERVER_CONFIG,
} from './bundle-shared';
import { Option, PackageCommand } from './command';
import {
  createHTMLTargetConfig as createRspackHTMLTargetConfig,
  createNodeTargetConfig as createRspackNodeTargetConfig,
  createServiceWorkerTargetConfig,
  createWorkerTargetConfig as createRspackWorkerTargetConfig,
} from './rspack';

interface AssetsManifest {
  js: string[];
  css: string[];
}

// Only these two app-shell targets should ever get a service worker —
// electron/desktop/ios/android are native shells, not browser tabs an OS
// can reclaim and relaunch offline, so CAP-1 doesn't apply to them. See
// _bmad-output/specs/spec-pwa-conversion/SPEC.md's Constraints.
const SERVICE_WORKER_ENABLED_PACKAGES = new Set([
  '@affine/web',
  '@affine/mobile',
]);

async function injectServiceWorkerManifest(pkg: Package, logger: Logger) {
  if (!SERVICE_WORKER_ENABLED_PACKAGES.has(pkg.name)) {
    return;
  }
  logger.info('Injecting service worker precache manifest...');

  // Precache exactly what index.html's entrypoint actually loads (read from
  // assets-manifest.json, emitted by the same build via
  // createHTMLTargetConfig's emitAssetsManifest option) — never a broad
  // js/**/*.js glob, which would also match the drawio shape-library
  // partitions (~52MB, Epic 10's lazy-loading fix) and the large lazily-
  // instantiated web workers (nbstore, pdf, mermaid, typst — none of these
  // are part of index.html's script tags). Explicit entries from the real
  // entrypoint manifest, not a guessed/hardcoded chunk-name list, so this
  // self-corrects if the entrypoint's chunk set ever changes.
  const manifestPath = pkg.distPath.join('assets-manifest.json').value;
  const assetsManifest = JSON.parse(
    readFileSync(manifestPath, 'utf-8')
  ) as AssetsManifest;

  // Hashed filenames (everything except index.html) already change when
  // their content changes, so `revision: null` is the correct, workbox-
  // endorsed value — passing a bare string instead just makes workbox warn
  // that it can't tell whether the entry is safely revisioned. index.html
  // has no hash in its name, so it gets a real content hash as its revision
  // so a change to it is actually detected.
  let totalBytes = 0;
  const manifestEntries: Array<{ url: string; revision: string | null }> = [
    ...assetsManifest.js,
    ...assetsManifest.css,
  ].map(relativePath => {
    const absolutePath = pkg.distPath.join(relativePath).value;
    totalBytes += statSync(absolutePath).size;
    return { url: `/${relativePath}`, revision: null };
  });

  const indexHtmlPath = pkg.distPath.join('index.html').value;
  const indexHtmlContent = readFileSync(indexHtmlPath);
  totalBytes += indexHtmlContent.byteLength;
  manifestEntries.push({
    // '/' , NOT '/index.html': confirmed via direct runtime testing that the
    // literal '/index.html' path is served differently server-side than '/'
    // (root) is, for reasons not fully root-caused — but '/' is what every
    // real navigation in this SPA actually resolves through (both plain '/'
    // and deep '/workspace/*' routes verified consistent with it), and it's
    // the one URL that's tested correct in every case. Precaching '/index.
    // html' literally was Task 1's original design and turned out to be
    // precaching a URL nothing in the app ever actually navigates to.
    url: '/',
    revision: createHash('md5').update(indexHtmlContent).digest('hex'),
  });

  const swPath = pkg.distPath.join('service-worker.js').value;
  const { count, warnings } = await injectManifest({
    swSrc: swPath,
    swDest: swPath,
    globDirectory: pkg.distPath.value,
    globPatterns: [],
    additionalManifestEntries: manifestEntries,
  });
  for (const warning of warnings) {
    logger.warn(warning);
  }
  logger.info(
    `Service worker precache manifest: ${count} files, ${(totalBytes / 1024 / 1024).toFixed(2)} MiB`
  );
}

type WorkerConfig = { name: string };
type CreateWorkerTargetConfig = (pkg: Package, entry: string) => WorkerConfig;
type BaseWorkerOptions = {
  includeMermaidAndTypst?: boolean;
};

function assertRspackSupportedPackage(pkg: Package) {
  assertRspackSupportedPackageName(pkg.name);
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
    case '@affine/web': {
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

      // Service worker registration is web/mobile-only — @affine/core (this
      // worker's registration call site) is also shared across the
      // electron, ios, and android app-shell targets, and none of those
      // should get a service worker (native shells, not browser tabs an OS
      // can reclaim and relaunch offline). See SPEC-pwa-conversion's
      // Constraints.
      const serviceWorkerConfig = createServiceWorkerTargetConfig(
        pkg,
        pkg.srcPath.join('service-worker.ts').value
      );

      return [
        createRspackHTMLTargetConfig(
          pkg,
          pkg.srcPath.join('index.tsx').value,
          {},
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
        serviceWorkerConfig,
      ] as MultiRspackOptions;
    }
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

      // See the matching comment in the '@affine/web' case above — mobile
      // is the actual PWA target for real mobile browsers (this server
      // routes mobile UAs here, not to @affine/web), so it needs the same
      // service worker treatment web already has.
      const mobileServiceWorkerConfig = createServiceWorkerTargetConfig(
        pkg,
        pkg.srcPath.join('service-worker.ts').value
      );

      return [
        createRspackHTMLTargetConfig(
          pkg,
          pkg.srcPath.join('index.tsx').value,
          {},
          workerConfigs.map(config => config.name)
        ),
        ...workerConfigs,
        mobileServiceWorkerConfig,
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
      await injectServiceWorkerManifest(pkg, logger);
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

    const serverConfig = merge({}, DEFAULT_DEV_SERVER_CONFIG, devServerConfig);
    if (devServerConfig?.proxy) {
      serverConfig.proxy = devServerConfig.proxy;
    }

    const devServer = new RspackDevServer(serverConfig, compiler);

    await devServer.start();
  }
}
