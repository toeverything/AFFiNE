import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const filenamesMapping = {
  windows: 'latest.yml',
  macos: 'latest-mac.yml',
  linux: 'latest-linux.yml',
};

const generateYml = platform => {
  const yml = {
    version: process.env.RELEASE_VERSION ?? '0.0.0',
    files: [],
  };
  const regex = new RegExp(`^affine-.*-${platform}-.*.(exe|zip|dmg|appimage)$`);
  const files = fs.readdirSync(process.cwd()).filter(file => regex.test(file));
  const outputFileName = filenamesMapping[platform];

  files.forEach(fileName => {
    const filePath = path.join(process.cwd(), './', fileName);
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
  // path & sha512 are deprecated
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

  fs.writeFileSync(outputFileName, ymlStr);
};

generateYml('windows');
generateYml('macos');
generateYml('linux');
