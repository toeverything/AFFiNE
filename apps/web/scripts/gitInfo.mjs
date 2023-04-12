// @ts-check
import { execSync } from 'node:child_process';

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
  return execSync('git describe --always --dirty').toString().trimEnd();
};

const getCommitHash = (rev = 'HEAD') =>
  execSync(`git rev-parse --short ${rev}`).toString().trimEnd();

export { getCommitHash, getGitVersion };
