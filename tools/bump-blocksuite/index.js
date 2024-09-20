import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Clipboard } from '@napi-rs/clipboard';
import {
  FetchOptions,
  ProxyOptions,
  RemoteCallbacks,
  Repository,
  Sort,
} from '@napi-rs/simple-git';
import chalk from 'chalk';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

import corePackage from '../../packages/frontend/core/package.json' assert { type: 'json' };

const clipboard = new Clipboard();

const oldHash = corePackage.dependencies['@blocksuite/affine'].split('-').pop();

const info = await fetch('https://registry.npmjs.org/@blocksuite/affine').then(
  res => res.json()
);

const latestVersion = info['dist-tags'].latest;
const latestHash = latestVersion.split('-').pop();

if (oldHash === latestHash) {
  console.info(chalk.greenBright('Already updated'));
  process.exit(0);
}

if (process.env.http_proxy) {
  setGlobalDispatcher(new ProxyAgent(process.env.http_proxy));
}

console.info(`Upgrade blocksuite from ${oldHash} -> ${latestHash}`);

const blockSuiteDeps = execSync(`yarn info -A --name-only --json`, {
  encoding: 'utf8',
});

const blocksuiteDepsList = blockSuiteDeps
  .split('\n')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s.substring(1, s.length - 1))
  .filter(
    s => s.startsWith('@blocksuite') && !s.startsWith('@blocksuite/icons')
  )
  .map(s => s.split('@npm').at(0));

for (const pkg of blocksuiteDepsList) {
  const command = `yarn up ${pkg}@${latestVersion}`;
  console.info(chalk.bgCyan(`Executing ${command}`));
  execSync(command, {
    stdio: 'inherit',
  });
}

console.info(`Upgrade complete`);

const repo = new Repository(
  join(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'BlockSuite')
);

const remote = repo.remoteAnonymous(
  'https://github.com/toeverything/BlockSuite.git'
);

remote.fetch(
  ['master'],
  new FetchOptions().proxyOptions(new ProxyOptions().auto()).remoteCallback(
    new RemoteCallbacks().transferProgress(progress => {
      if (progress.totalDeltas && progress.totalObjects) {
        console.log(
          `${(
            (progress.receivedObjects / progress.totalObjects) * 50 +
            (progress.indexedDeltas / progress.totalDeltas) * 50
          ).toFixed(2)}%`
        );
      }
    })
  )
);

const latest = repo.findCommit(latestHash);

const commits = {
  Features: [],
  Bugfix: [],
  Refactor: [],
  Misc: [],
};

for (const oid of repo
  .revWalk()
  .push(latest.id())
  .setSorting(Sort.Time & Sort.Topological)) {
  if (oid.startsWith(oldHash)) {
    break;
  }
  const commit = repo.findCommit(oid);
  const summary = commit.summary();
  if (summary.startsWith('feat')) {
    commits.Features.push(commit);
  } else if (summary.startsWith('fix')) {
    commits.Bugfix.push(commit);
  } else if (summary.startsWith('refactor')) {
    commits.Refactor.push(commit);
  } else {
    commits.Misc.push(commit);
  }
}

clipboard.setText(await formatCommits(commits));

console.info(`Changelog copied to clipboard`);

async function formatCommits(commits) {
  return `## Features
${await Promise.all(commits.Features.map(format)).then(commits =>
  commits.join('\n')
)}

## Bugfix
${await Promise.all(commits.Bugfix.map(format)).then(commits =>
  commits.join('\n')
)}

## Refactor
${await Promise.all(commits.Refactor.map(format)).then(commits =>
  commits.join('\n')
)}

## Misc
${await Promise.all(commits.Misc.map(format)).then(commits =>
  commits.join('\n')
)}
`;
  /**
   * @param {import('./index').Commit} commit
   * @returns string
   */
  async function format(commit) {
    const summary = commit.summary();
    const match = summary.match(/\(#(\d+)\)/);
    if (match) {
      const [_, pull] = match;
      const pullInfo = await fetch(
        `https://api.github.com/repos/toeverything/BlockSuite/pulls/${pull}`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
            'X-GitHub-Api-Version': '2022-11-28',
          },
        }
      )
        .then(res => res.json())
        .catch(() => ({ user: {} }));
      const {
        user: { login },
      } = pullInfo;
      return `- https://github.com/toeverything/BlockSuite/pull/${pull} @${login}`;
    }
    return `- ${summary}`;
  }
}
