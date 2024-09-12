import path from 'node:path';

import { buildForge } from 'app-builder-lib';
import debug from 'debug';
import fs from 'fs-extra';

import {
  appIdMap,
  arch,
  buildType,
  iconPngPath,
  icoPath,
  platform,
  productName,
  REPO_ROOT,
  ROOT,
} from './make-env.js';

const log = debug('make-nsis');

async function make() {
  const appName = productName;
  const makeDir = path.resolve(ROOT, 'out', buildType, 'make');
  const outPath = path.resolve(makeDir, `nsis.windows/${arch}`);
  const appDirectory = path.resolve(
    ROOT,
    'out',
    buildType,
    `${appName}-${platform}-${arch}`
  );

  await fs.ensureDir(outPath);
  await fs.emptyDir(outPath);

  // create tmp dir
  const tmpPath = await fs.mkdtemp(appName);

  // copy app to tmp dir
  log(`Copying app to ${tmpPath}`);
  await fs.copy(appDirectory, tmpPath);

  log(`Calling app-builder-lib's buildForge() with ${tmpPath}`);
  const output = await buildForge(
    { dir: tmpPath },
    {
      win: [`nsis:${arch}`],
      // @ts-expect-error - upstream type is wrong
      publish: null, // buildForge will incorrectly publish the build
      config: {
        appId: appIdMap[buildType],
        productName,
        executableName: productName,
        icon: iconPngPath,
        extraMetadata: {
          // do not use package.json's name
          name: productName,
        },
        nsis: {
          differentialPackage: false,
          perMachine: false,
          oneClick: false,
          license: path.resolve(REPO_ROOT, 'LICENSE'),
          include: path.resolve(ROOT, 'scripts', 'nsis-installer.nsh'),
          installerIcon: icoPath,
          allowToChangeInstallationDirectory: true,
          installerSidebar: path.resolve(
            ROOT,
            'resources',
            'icons',
            'nsis-sidebar.bmp'
          ),
        },
      },
    }
  );

  // Move the output to the actual output folder, app-builder-lib might get it wrong
  log('making nsis.windows done:', output);

  const result: Array<string> = [];
  for (const file of output) {
    const filePath = path.resolve(outPath, path.basename(file));
    result.push(filePath);

    await fs.move(file, filePath);
  }

  // cleanup
  await fs.remove(tmpPath);
}

make();
