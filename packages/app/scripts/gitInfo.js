// @ts-check

// import { execSync } from 'child_process'
const { execSync } = require('child_process');

const hasGit = () => {
  try {
    execSync('git --version');
  } catch {
    return false;
  }
  return true;
};

const getTopLevel = () => execSync('git rev-parse --show-toplevel');
const isRepository = () => {
  try {
    getTopLevel();
  } catch {
    return false;
  }
  return true;
};

const getGitVersion = () => {
  if (!hasGit() || !isRepository()) {
    console.error(
      "You haven't installed git or it does not exist in your PATH."
    );
    return null;
  }
  const VERSION = execSync('git describe --always --dirty')
    .toString()
    // remove empty line
    .replace(/[\s\r\n]+$/, '');

  return VERSION;
};

const getCommitHash = (rev = 'HEAD') =>
  execSync(`git rev-parse --short ${rev}`).toString();

module.exports = {
  getGitVersion,
  getCommitHash,
};
