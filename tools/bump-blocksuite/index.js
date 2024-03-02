import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Clipboard } from '@napi-rs/clipboard';
import { FetchOptions, ProxyOptions, RemoteCallbacks, Repository, Sort } from '@napi-rs/simple-git';
import chalk from 'chalk';
import corePackage from '../../packages/frontend/core/package.json' assert { type: 'json' };

const clipboard = new Clipboard();
const repoDir = join(fileURLToPath(import.meta.url), '..', '..', '..', '..', 'BlockSuite');
const oldHash = corePackage.dependencies['@blocksuite/block-std'].split('-').pop();

async function main() {
    const latestVersion = await fetchLatestVersion();
    const latestHash = latestVersion.split('-').pop();

    if (oldHash === latestHash) {
        console.info(chalk.greenBright('Already updated'));
        process.exit(0);
    }

    console.info(`Upgrade blocksuite from ${oldHash} -> ${latestHash}`);

    await updateDependencies(latestVersion);
    await updateRepository(latestHash);

    console.info(`Upgrade complete`);
    await copyChangelogToClipboard(latestHash);
}

async function fetchLatestVersion() {
    const info = await fetch('https://registry.npmjs.org/@blocksuite/block-std').then(res => res.json());
    return info['dist-tags'].canary;
}

async function updateDependencies(latestVersion) {
    const blockSuiteDeps = execSync(`yarn info -A --name-only --json`, { encoding: 'utf8' });
    const blocksuiteDepsList = blockSuiteDeps.split('\n').map(s => s.trim()).filter(Boolean)
        .map(s => s.substring(1, s.length - 1)).filter(s => s.startsWith('@blocksuite') && !s.startsWith('@blocksuite/icons'))
        .map(s => s.split('@npm').at(0));

    for (const pkg of blocksuiteDepsList) {
        const command = `yarn up ${pkg}@${latestVersion}`;
        console.info(chalk.bgCyan(`Executing ${command}`));
        execSync(command, { stdio: 'inherit' });
    }
}

async function updateRepository(latestHash) {
    const repo = new Repository(repoDir);
    const remote = repo.remoteAnonymous('https://github.com/toeverything/BlockSuite.git');

    remote.fetch(['master'], new FetchOptions().proxyOptions(new ProxyOptions().auto()).remoteCallback(
        new RemoteCallbacks().transferProgress(progress => {
            if (progress.totalDeltas && progress.totalObjects) {
                console.log(`${((progress.receivedObjects / progress.totalObjects) * 50 + (progress.indexedDeltas / progress.totalDeltas) * 50).toFixed(2)}%`);
            }
        })
    ));

    const latest = repo.findCommit(latestHash);
    const commits = {
        Features: [],
        Bugfix: [],
        Refactor: [],
        Misc: [],
    };

    for (const oid of repo.revWalk().push(latest.id()).setSorting(Sort.Time & Sort.Topological)) {
        const commit = repo.findCommit(oid);
        const summary = commit.summary();
        categorizeCommit(commits, summary, commit);
        if (oid.startsWith(oldHash)) {
            break;
        }
    }
}

function categorizeCommit(commits, summary, commit) {
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

async function copyChangelogToClipboard(latestHash) {
    const commits = await collectCommits(latestHash);
    clipboard.setText(formatCommits(commits));
    console.info(`Changelog copied to clipboard`);
}

async function collectCommits(latestHash) {
    const repo = new Repository(repoDir);
    const latest = repo.findCommit(latestHash);
    const commits = { Features: [], Bugfix: [], Refactor: [], Misc: [] };

    for (const oid of repo.revWalk().push(latest.id()).setSorting(Sort.Time & Sort.Topological)) {
        const commit = repo.findCommit(oid);
        const summary = commit.summary();
        categorizeCommit(commits, summary, commit);
        if (oid.startsWith(oldHash)) {
            break;
        }
    }

    return commits;
}

function formatCommits(commits) {
    const categories = ['Features', 'Bugfix', 'Refactor', 'Misc'];
    return categories.map(category => `## ${category}\n${commits[category].map(formatCommit).join('\n')}`).join('\n');
}

async function formatCommit(commit) {
    const summary = commit.summary();
    const match = summary.match(/\(#(\d+)\)/);
    if (match) {
        const pull = match[1];
        try {
            const pullInfo = await fetch(`https://api.github.com/repos/toeverything/BlockSuite/pulls/${pull}`, {
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                },
            }).then(res => res.json());
            const login = pullInfo?.user?.login || '';
            return `- https://github.com/toeverything/BlockSuite/pull/${pull} @${login}`;
        } catch (error) {
            console.error(error);
        }
    }
    return `- ${summary}`;
}

main().catch(error => console.error(error));
