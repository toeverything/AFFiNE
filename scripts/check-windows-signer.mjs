import fs from 'node:fs';

const buildType = process.env.BUILD_TYPE;
const requireSigner =
  process.env.REQUIRE_SIGNER === 'true' ||
  ['beta', 'stable'].includes(buildType);
const githubToken = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const apiUrl = process.env.GITHUB_API_URL ?? 'https://api.github.com';
const outputPath = process.env.GITHUB_OUTPUT;

if (!githubToken) {
  fail('Missing GITHUB_TOKEN.');
}

if (!repository) {
  fail('Missing GITHUB_REPOSITORY.');
}

const [owner, repo] = repository.split('/');
if (!owner || !repo) {
  fail(`Invalid GITHUB_REPOSITORY: ${repository}`);
}

try {
  const runners = await listAllRunners(owner, repo);
  const signerAvailable = runners.some(runner => {
    const labels = (runner.labels ?? []).map(label => label.name);
    return runner.status === 'online' && labels.includes('win-signer');
  });

  setOutput('signer_available', signerAvailable ? 'true' : 'false');

  if (!signerAvailable) {
    const message =
      'No online self-hosted runner with label "win-signer" is available.';
    if (requireSigner) {
      fail(message);
    } else {
      console.warn(
        `::warning::${message} Windows installer executables will be skipped.`
      );
    }
  }
} catch (error) {
  setOutput('signer_available', 'false');
  const message = `Failed to query self-hosted runner availability: ${formatError(error)}`;
  if (requireSigner) {
    fail(message);
  } else {
    console.warn(
      `::warning::${message} Windows installer executables will be skipped.`
    );
  }
}

async function listAllRunners(owner, repo) {
  const runners = [];
  let page = 1;

  while (true) {
    const url = new URL(
      `/repos/${owner}/${repo}/actions/runners`,
      ensureTrailingSlash(apiUrl)
    );
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`GitHub API ${response.status}: ${body}`);
    }

    const data = await response.json();
    runners.push(...(data.runners ?? []));

    if ((data.runners ?? []).length < 100) {
      return runners;
    }

    page += 1;
  }
}

function ensureTrailingSlash(url) {
  return url.endsWith('/') ? url : `${url}/`;
}

function setOutput(name, value) {
  if (!outputPath) return;
  fs.appendFileSync(outputPath, `${name}=${value}\n`);
}

function fail(message) {
  console.error(`::error::${message}`);
  process.exit(1);
}

function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
