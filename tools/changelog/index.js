import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Repository, Sort } from '@napi-rs/simple-git';
import { WebClient } from '@slack/web-api';
import {
  generateMarkdown,
  parseCommits,
  resolveAuthors,
  resolveConfig,
} from 'changelogithub';

import { render } from './markdown.js';

const {
  DEPLOYED_URL,
  NAMESPACE,
  CHANNEL_ID,
  SLACK_BOT_TOKEN,
  PREV_VERSION,
  DEPLOYMENT,
  FLAVOR,
  BLOCKSUITE_REPO_PATH,
} = process.env;

const slack = new WebClient(SLACK_BOT_TOKEN);
const rootDir = join(fileURLToPath(import.meta.url), '..', '..', '..');
const repo = new Repository(rootDir);

/**
 * @param {import('@napi-rs/simple-git').Repository} repo
 * @param {string} name
 */
function findTagByName(repo, name) {
  let tag = null;
  repo.tagForeach((id, tagName) => {
    if (`refs/tags/v${name}` === tagName.toString('utf-8')) {
      tag = repo.findCommit(id);
      return false;
    }
    return true;
  });
  return tag;
}

/**
 * @param {import('@napi-rs/simple-git').Repository} repo
 * @param {string} previousCommit
 * @param {string | undefined} currentCommit
 * @returns {Promise<string>}
 */
async function getChangeLog(repo, previousCommit, currentCommit) {
  const prevCommit =
    repo.findCommit(previousCommit) ?? findTagByName(repo, previousCommit);
  if (!prevCommit) {
    console.log(
      `Previous commit ${previousCommit} in ${repo.path()} not found`
    );
    return '';
  }
  /** @type {typeof import('changelogithub')['parseCommits'] extends (commit: infer C, ...args: any[]) => any ? C : any} */
  const commits = [];

  const revWalk = repo.revWalk();

  if (currentCommit) {
    const commit =
      repo.findCommit(currentCommit) ?? findTagByName(repo, previousCommit);
    if (!commit) {
      console.log(
        `Current commit ${currentCommit} not found in ${repo.path()}`
      );
      return '';
    }
    revWalk.push(commit.id());
  } else {
    revWalk.pushHead();
  }

  for (const commitId of revWalk.setSorting(Sort.Time & Sort.Topological)) {
    const commit = repo.findCommit(commitId);
    commits.push({
      message: commit.message(),
      body: commit.body() ?? '',
      shortHash: commit.id().substring(0, 8),
      author: {
        name: commit.author().name(),
        email: commit.author().email(),
      },
    });
    if (commitId.startsWith(previousCommit)) {
      break;
    }
  }

  const parseConfig = await resolveConfig({
    token: process.env.GITHUB_TOKEN,
  });

  const parsedCommits = parseCommits(commits, parseConfig);
  await resolveAuthors(parsedCommits, parseConfig);
  return generateMarkdown(parsedCommits, parseConfig)
    .replaceAll('&nbsp;', ' ')
    .replaceAll('<samp>', '')
    .replaceAll('</samp>', '');
}

let blockSuiteChangelog = '';
const pkgJsonPath = 'packages/frontend/core/package.json';

const content = await readFile(join(rootDir, pkgJsonPath), 'utf8');
const { dependencies } = JSON.parse(content);
const blocksuiteVersion = dependencies['@blocksuite/affine'];

const prevCommit = repo.findCommit(PREV_VERSION);

if (!prevCommit) {
  console.info(
    `Can't find prev commit ${PREV_VERSION} on the git tree, skip the changelog generation`
  );
  process.exit(0);
}

const previousPkgJsonBlob = prevCommit
  .tree()
  .getPath(pkgJsonPath)
  .toObject(repo)
  .peelToBlob();
const previousPkgJson = JSON.parse(
  Buffer.from(previousPkgJsonBlob.content()).toString('utf8')
);
const previousBlocksuiteVersion =
  previousPkgJson.dependencies['@blocksuite/affine'];

if (blocksuiteVersion !== previousBlocksuiteVersion) {
  const blockSuiteRepo = new Repository(
    BLOCKSUITE_REPO_PATH ?? join(rootDir, '..', 'blocksuite')
  );
  console.log(
    `Blocksuite ${previousBlocksuiteVersion} -> ${blocksuiteVersion}`
  );
  blockSuiteChangelog = await getChangeLog(
    blockSuiteRepo,
    previousBlocksuiteVersion,
    blocksuiteVersion
  );
}

const messageHead =
  DEPLOYMENT === 'server'
    ? `# Server deployed in ${NAMESPACE}

- [${DEPLOYED_URL}](${DEPLOYED_URL})
`
    : `# AFFiNE Client ${FLAVOR} released`;

let changelogMessage = `${messageHead}

${await getChangeLog(repo, PREV_VERSION)}
`;

if (blockSuiteChangelog) {
  changelogMessage += `

# Blocksuite Changelog

${blockSuiteChangelog}`;
}

const { ok } = await slack.chat.postMessage({
  channel: CHANNEL_ID,
  text: `${DEPLOYMENT === 'server' ? 'Server' : 'Client'} deployed`,
  blocks: render(changelogMessage),
});

console.assert(ok, 'Failed to send a message to Slack');
