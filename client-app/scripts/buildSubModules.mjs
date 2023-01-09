/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
const repoDirectory = path.join(__dirname, '..');
const publicDistributionDirectory = path.join(repoDirectory, 'public');

const octoBaseBranchName = 'feat/jsonschema-for-types';
/**
 * 1. Until OctoBase become public, we link it using submodule too.
 */
cd(`${path.join(repoDirectory, 'src-OctoBase')}`);
await $`git checkout ${octoBaseBranchName}`;
await $`git submodule update --recursive && git submodule update --remote`;
await $`git pull origin ${octoBaseBranchName}`;
await $`git reset --hard origin/${octoBaseBranchName}`;
