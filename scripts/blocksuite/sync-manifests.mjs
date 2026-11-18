/**
 * Keep the publish-relevant metadata of every `@blocksuite/*` package.json in
 * sync. Today that is only the `repository` field, which npm requires to match
 * the workflow's repository before it accepts a provenance attestation.
 *
 * Usage:
 *   node scripts/blocksuite/sync-manifests.mjs          # fix in place
 *   node scripts/blocksuite/sync-manifests.mjs --check  # fail if out of date
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { listPublishedWorkspaces, rootDir } from './lib.mjs';

const { values } = parseArgs({
  options: {
    check: { type: 'boolean', default: false },
  },
});

const repositoryUrl = 'git+https://github.com/toeverything/AFFiNE.git';

function expectedFields(location) {
  return {
    repository: {
      type: 'git',
      url: repositoryUrl,
      directory: location,
    },
  };
}

function withFields(pkg, fields) {
  // Insert new keys after `license` so the manifests stay readable; keep the
  // position of keys that already exist.
  const next = {};
  const pending = { ...fields };
  for (const [key, value] of Object.entries(pkg)) {
    if (key in pending) {
      next[key] = pending[key];
      delete pending[key];
      continue;
    }
    next[key] = value;
    if (key === 'license') {
      Object.assign(next, pending);
      for (const inserted of Object.keys(pending)) delete pending[inserted];
    }
  }
  Object.assign(next, pending);
  return next;
}

const outdated = [];

for (const workspace of listPublishedWorkspaces()) {
  const file = path.join(rootDir, workspace.location, 'package.json');
  const raw = fs.readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  const fields = expectedFields(workspace.location);
  const next = withFields(pkg, fields);
  const serialized = `${JSON.stringify(next, null, 2)}\n`;
  if (serialized === raw) continue;
  outdated.push(workspace.location);
  if (!values.check) {
    fs.writeFileSync(file, serialized);
  }
}

if (outdated.length === 0) {
  console.log('All @blocksuite package manifests are in sync.');
} else if (values.check) {
  console.error(
    `${outdated.length} package manifest(s) are out of date. Run \`node scripts/blocksuite/sync-manifests.mjs\` and commit the result:`
  );
  for (const location of outdated) console.error(`  - ${location}`);
  process.exit(1);
} else {
  console.log(`Updated ${outdated.length} package manifest(s):`);
  for (const location of outdated) console.log(`  - ${location}`);
}
