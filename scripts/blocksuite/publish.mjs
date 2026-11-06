/**
 * Publish the packed tarballs to npm, dependencies first, skipping any
 * name@version that is already on the registry so a failed run can simply be
 * re-run.
 *
 * Provenance is enabled automatically inside GitHub Actions (trusted
 * publishing via OIDC, no token needed) and disabled elsewhere.
 *
 * Usage:
 *   node scripts/blocksuite/publish.mjs [--packs <dir>] [--tag <dist-tag>]
 *     [--expect-version <version>] [--dry-run] [--no-provenance]
 *     [--registry <url>]
 */
import path from 'node:path';
import { parseArgs } from 'node:util';

import semver from 'semver';

import {
  capture,
  defaultPacksDir,
  loadManifest,
  logStep,
  mdTable,
  npmRegistry,
  releaseDir,
  run,
  writeReport,
} from './lib.mjs';

const { values } = parseArgs({
  allowNegative: true,
  options: {
    packs: { type: 'string', default: defaultPacksDir },
    tag: { type: 'string' },
    'expect-version': { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    provenance: {
      type: 'boolean',
      default: process.env.GITHUB_ACTIONS === 'true',
    },
    registry: { type: 'string', default: npmRegistry },
  },
});

const packsDir = path.resolve(values.packs);
const manifest = loadManifest(packsDir);

if (!manifest.version) {
  throw new Error(
    'Packed packages do not share one version; refusing to publish a mixed set.'
  );
}
const version = manifest.version;
if (!semver.valid(version)) {
  throw new Error(`"${version}" is not a valid semver version`);
}
if (values['expect-version'] && values['expect-version'] !== version) {
  throw new Error(
    `Packed version ${version} does not match the expected version ${values['expect-version']}. ` +
      'Merge the version PR before tagging, or tag the right commit.'
  );
}

function inferDistTag(v) {
  if (/-canary[-.]/.test(v)) return 'canary';
  if (semver.prerelease(v)) return 'next';
  return 'latest';
}
const distTag = values.tag ?? inferDistTag(version);
if (distTag === 'latest' && semver.prerelease(version)) {
  throw new Error(`Refusing to publish prerelease ${version} as "latest".`);
}

const npmVersion = capture('npm', ['--version']).stdout.trim();
if (values.provenance && semver.lt(npmVersion, '11.5.1')) {
  console.warn(
    `warning: npm ${npmVersion} predates trusted publishing support (11.5.1); run \`npm install -g npm@latest\` first.`
  );
}

logStep(
  `Publishing ${manifest.packages.length} packages at ${version} with dist-tag "${distTag}"` +
    `${values['dry-run'] ? ' (dry run)' : ''}${values.provenance ? ' with provenance' : ''} to ${values.registry}`
);

function alreadyPublished(name) {
  const spec = `${name}@${version}`;
  const view = capture('npm', [
    'view',
    spec,
    'version',
    '--json',
    '--registry',
    values.registry,
  ]);
  if (view.status === 0) {
    return view.stdout.trim().length > 0;
  }
  if (/E404|404 Not Found/.test(`${view.stdout}\n${view.stderr}`)) {
    return false;
  }
  throw new Error(`npm view ${spec} failed:\n${view.stderr || view.stdout}`);
}

const published = [];
const skipped = [];

for (const pkg of manifest.packages) {
  if (alreadyPublished(pkg.name)) {
    console.log(`  – ${pkg.name}@${version} is already published, skipping`);
    skipped.push(pkg);
    continue;
  }
  const args = [
    'publish',
    path.join(packsDir, pkg.file),
    '--access',
    'public',
    '--tag',
    distTag,
    '--registry',
    values.registry,
    '--loglevel=warn',
  ];
  if (values.provenance) args.push('--provenance');
  if (values['dry-run']) args.push('--dry-run');
  console.log(`  ↑ ${pkg.name}@${version}`);
  run('npm', args, { cwd: packsDir });
  published.push(pkg);
}

const report = [
  `### npm publish${values['dry-run'] ? ' (dry run)' : ''}: ${version} → \`${distTag}\``,
  '',
  `${published.length} published, ${skipped.length} already on the registry.` +
    `${values.provenance ? ' Provenance attestations attached.' : ''}`,
  '',
  mdTable(
    ['Package', 'Result'],
    manifest.packages.map(pkg => [
      `\`${pkg.name}\``,
      published.includes(pkg)
        ? values['dry-run']
          ? 'would publish'
          : `[published](https://www.npmjs.com/package/${pkg.name}/v/${version})`
        : 'already published',
    ])
  ),
].join('\n');

writeReport(report, path.join(releaseDir, 'publish-report.md'));
console.log(
  `\n${published.length} published, ${skipped.length} skipped (already on the registry).`
);
