/**
 * Pack every publishable `@blocksuite/*` workspace into a tarball.
 *
 * `yarn pack` applies the same transforms as `yarn npm publish` (it rewrites
 * `workspace:*` ranges to real versions and honours `files`/`publishConfig`),
 * so the tarballs produced here are byte-for-byte what would be published.
 * A manifest.json describing them, in dependency order, is written next to
 * the tarballs and consumed by validate/smoke/publish.
 *
 * Usage: node scripts/blocksuite/pack.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import {
  defaultPacksDir,
  formatBytes,
  logStep,
  manifestFileName,
  mdTable,
  publishedPackagePattern,
  readPackedManifest,
  run,
  writeReport,
} from './lib.mjs';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: defaultPacksDir },
  },
});

const outDir = path.resolve(values.out);

logStep(`Packing ${publishedPackagePattern} workspaces into ${outDir}`);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

run('yarn', [
  'workspaces',
  'foreach',
  '--all',
  '--no-private',
  '--include',
  publishedPackagePattern,
  '--topological-dev',
  'pack',
  '--out',
  path.join(outDir, '%s-%v.tgz'),
]);

logStep('Reading packed manifests');
const tarballs = fs
  .readdirSync(outDir)
  .filter(file => file.endsWith('.tgz'))
  .sort();

if (tarballs.length === 0) {
  throw new Error(`No tarballs were produced in ${outDir}`);
}

const packages = tarballs.map(file => {
  const tgz = path.join(outDir, file);
  const pkg = readPackedManifest(tgz);
  return {
    name: pkg.name,
    version: pkg.version,
    file,
    size: fs.statSync(tgz).size,
    dependencies: {
      ...pkg.dependencies,
      ...pkg.optionalDependencies,
      ...pkg.peerDependencies,
    },
  };
});

const names = new Set(packages.map(pkg => pkg.name));
for (const pkg of packages) {
  pkg.internalDependencies = Object.keys(pkg.dependencies)
    .filter(dep => names.has(dep))
    .sort();
  delete pkg.dependencies;
}

// Dependencies first, so `publish` can walk the list in order.
const byName = new Map(packages.map(pkg => [pkg.name, pkg]));
const ordered = [];
const state = new Map();
const visit = pkg => {
  if (state.get(pkg.name) === 'done') return;
  if (state.get(pkg.name) === 'visiting') {
    // Cycles are tolerated: npm does not care, this is only for nicer order.
    return;
  }
  state.set(pkg.name, 'visiting');
  for (const dep of pkg.internalDependencies) {
    visit(byName.get(dep));
  }
  state.set(pkg.name, 'done');
  ordered.push(pkg);
};
packages.forEach(visit);

const versions = new Set(ordered.map(pkg => pkg.version));
if (versions.size > 1) {
  console.warn(
    `warning: packed packages do not share a single version: ${[...versions].join(', ')}`
  );
}

const manifest = {
  createdAt: new Date().toISOString(),
  version: versions.size === 1 ? [...versions][0] : null,
  packages: ordered,
};
fs.writeFileSync(
  path.join(outDir, manifestFileName),
  `${JSON.stringify(manifest, null, 2)}\n`
);

const totalSize = ordered.reduce((sum, pkg) => sum + pkg.size, 0);
const report = [
  `### Packed ${ordered.length} packages (${formatBytes(totalSize)})`,
  '',
  mdTable(
    ['Package', 'Version', 'Tarball', 'Size'],
    ordered.map(pkg => [
      `\`${pkg.name}\``,
      pkg.version,
      pkg.file,
      formatBytes(pkg.size),
    ])
  ),
].join('\n');

console.log(report);
writeReport(report, path.join(outDir, '..', 'pack-report.md'));
console.log(`\nmanifest: ${path.join(outDir, manifestFileName)}`);
