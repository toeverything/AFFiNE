// do not run in your local machine
/* eslint-disable */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const glob = require('glob');
/* eslint-enable */

const yml = {
  version: process.env.RELEASE_VERSION ?? '0.0.0',
  files: [],
};

const generateYml = async platform => {
  const files = glob.sync(`./affine-*-${platform}-*.{exe,zip,dmg,AppImage}`);

  files.forEach(fileName => {
    const filePath = path.join(__dirname, './', fileName);
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
    } catch (e) {}
  });
  yml.path = yml.files[0].url;
  yml.sha512 = yml.files[0].sha512;
  yml.releaseDate = new Date().toISOString();

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
    `path: ${yml.path}\n` +
    `sha512: ${yml.sha512}\n` +
    `releaseDate: ${yml.releaseDate}\n`;

  const fileName = platform === 'windows' ? 'latest.yml' : 'latest-mac.yml';

  fs.writeFileSync(fileName, ymlStr);
};
generateYml('windows');
generateYml('macos');
