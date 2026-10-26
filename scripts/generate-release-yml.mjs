import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const releaseDir = path.join(process.cwd(), './release');

const filenamesMapping = {
  all: 'latest.yml',
  macos: 'latest-mac.yml',
  linux: 'latest-linux.yml',
};

const releaseFiles = ['zip', 'exe', 'dmg', 'appimage', 'deb', 'flatpak'];
const releaseMetadata = {};

const generateYml = platform => {
  const yml = {
    version: process.env.RELEASE_VERSION ?? '0.0.0',
    files: [],
  };

  const regex =
    // we involves all distribution files in one release file to enforce we handle auto updater correctly
    platform === 'all'
      ? new RegExp(`.(${releaseFiles.join('|')})$`)
      : new RegExp(`.+-${platform}-.+.(${releaseFiles.join('|')})$`);

  const files = fs.readdirSync(releaseDir).filter(file => regex.test(file));
  const outputFileName = filenamesMapping[platform];

  console.info(`Release content for ${platform}:`);
  console.info(JSON.stringify(files, null, 2), '\n');

  files.forEach(fileName => {
    const filePath = path.join(releaseDir, fileName);
    try {
      const fileData = fs.readFileSync(filePath);
      const hash = crypto
        .createHash('sha512')
        .update(fileData)
        .digest('base64');
      const size = fs.statSync(filePath).size;

      yml.files.push({
        url: fileName,
        sha512: hash,
        size: size,
      });
    } catch {}
  });
  yml.releaseDate = new Date().toISOString();

  // NOTE(@forehalo): make sure old windows x64 won't fetch windows arm64 by default
  // maybe we need to separate arm64 builds to separated yml file `latest-arm64.yml`, `latest-linux-arm64.yml`
  // check https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/Provider.ts#L30
  // and packages/frontend/apps/electron/src/main/updater/affine-update-provider.ts#L100
  yml.files.sort(a => (a.url.includes('windows-arm64') ? 1 : -1));

  const ymlStr =
    `version: ${yml.version}\n` +
    `files:\n` +
    yml.files
      .map(file => {
        return (
          `  - url: ${file.url}\n` +
          `    sha512: ${file.sha512}\n` +
          `    size: ${file.size}\n`
        );
      })
      .join('') +
    `releaseDate: ${yml.releaseDate}\n`;

  fs.writeFileSync(path.join(releaseDir, outputFileName), ymlStr);
  releaseMetadata[outputFileName] = yml;
};

generateYml('macos');
generateYml('linux');
generateYml('all');

fs.writeFileSync(
  path.join(releaseDir, 'release-metadata.json'),
  JSON.stringify(releaseMetadata)
);
