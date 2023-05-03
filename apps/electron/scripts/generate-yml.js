// do not run in your local machine
/* eslint-disable */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
/* eslint-enable */

const yml = {
  version: process.env.RELEASE_VERSION ?? '0.0.0',
  files: [],
};

let fileList = [];
// TODO: maybe add `beta` and `stable`
const BUILD_TYPE = process.env.BUILD_TYPE || 'canary';

const generateYml = async () => {
  fileList = [
    `affine-${BUILD_TYPE}-macos-arm64.dmg`,
    `affine-${BUILD_TYPE}-macos-arm64.zip`,
    `affine-${BUILD_TYPE}-macos-x64.zip`,
    `affine-${BUILD_TYPE}-macos-x64.dmg`,
  ];
  fileList.forEach(fileName => {
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

  fs.writeFileSync(`./latest-mac.yml`, ymlStr);
};
generateYml();
