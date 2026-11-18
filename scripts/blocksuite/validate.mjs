/**
 * Validate the packed tarballs with publint and arethetypeswrong.
 *
 * Usage:
 *   node scripts/blocksuite/validate.mjs [--packs <dir>]
 *     [--fail-on error|warning|none] [--attw-profile esm-only|node16|strict]
 *     [--concurrency <n>]
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { publint } from 'publint';
import { formatMessage } from 'publint/utils';

import {
  defaultPacksDir,
  loadManifest,
  logStep,
  mdTable,
  readPackedManifest,
  releaseDir,
  rootDir,
  writeReport,
} from './lib.mjs';

const { values } = parseArgs({
  options: {
    packs: { type: 'string', default: defaultPacksDir },
    'fail-on': { type: 'string', default: 'error' },
    'attw-profile': { type: 'string', default: 'esm-only' },
    concurrency: { type: 'string', default: '4' },
  },
});

const packsDir = path.resolve(values.packs);
const failOn = values['fail-on'];
if (!['error', 'warning', 'none'].includes(failOn)) {
  throw new Error(`--fail-on must be error, warning or none (got ${failOn})`);
}
const concurrency = Math.max(1, Number.parseInt(values.concurrency, 10) || 1);
const attwBin = path.join(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'attw.cmd' : 'attw'
);

const manifest = loadManifest(packsDir);

// Mirrors attw's built-in profiles.
const profileIgnoredResolutions = {
  strict: [],
  node16: ['node10'],
  'esm-only': ['node10', 'node16-cjs'],
};
if (!(values['attw-profile'] in profileIgnoredResolutions)) {
  throw new Error(
    `--attw-profile must be one of ${Object.keys(profileIgnoredResolutions).join(', ')}`
  );
}
const ignoredResolutions = new Set(
  profileIgnoredResolutions[values['attw-profile']]
);

const attwOutDir = path.join(releaseDir, 'attw');
fs.rmSync(attwOutDir, { recursive: true, force: true });
fs.mkdirSync(attwOutDir, { recursive: true });

async function runPublint(tgz) {
  const tarball = fs.readFileSync(tgz);
  const result = await publint({ pack: { tarball }, level: 'suggestion' });
  const pkg = result.pkg ?? readPackedManifest(tgz);
  const messages = result.messages.map(message => ({
    type: message.type,
    text: formatMessage(message, pkg),
  }));
  return {
    messages,
    errors: messages.filter(m => m.type === 'error').length,
    warnings: messages.filter(m => m.type === 'warning').length,
    suggestions: messages.filter(m => m.type === 'suggestion').length,
  };
}

function runAttw(tgz) {
  // attw exits through process.exit(), which truncates large JSON documents
  // written to a pipe, so its stdout goes to a file instead.
  const outFile = path.join(attwOutDir, `${path.basename(tgz, '.tgz')}.json`);
  const fd = fs.openSync(outFile, 'w');
  return new Promise(resolve => {
    const child = spawn(
      attwBin,
      [
        tgz,
        '--profile',
        values['attw-profile'],
        '--format',
        'json',
        '--no-emoji',
        '--no-color',
      ],
      {
        cwd: rootDir,
        stdio: ['ignore', fd, 'pipe'],
        shell: process.platform === 'win32',
      }
    );
    let stderr = '';
    child.stderr.on('data', chunk => (stderr += chunk));
    child.on('error', error =>
      resolve({ code: -1, stderr: `${stderr}\n${error.message}` })
    );
    child.on('close', code => resolve({ code, stderr }));
  }).then(({ code, stderr }) => {
    fs.closeSync(fd);
    const stdout = fs.readFileSync(outFile, 'utf8');
    let json;
    try {
      json = JSON.parse(stdout);
    } catch {
      return {
        failed: true,
        problems: [],
        error: `attw exited with ${code}: ${stderr.trim() || stdout.trim()}`,
      };
    }
    const analysis = json.analysis ?? json;
    let problems = analysis.problems;
    if (!Array.isArray(problems)) {
      if (Array.isArray(json.problems)) {
        problems = json.problems;
      } else if (json.problems && typeof json.problems === 'object') {
        problems = Object.values(json.problems).flat();
      } else {
        problems = [];
      }
    }
    // The JSON output lists every problem regardless of profile; apply the
    // profile's ignored resolution kinds ourselves.
    problems = problems.filter(
      problem =>
        !problem.resolutionKind ||
        !ignoredResolutions.has(problem.resolutionKind)
    );
    if (analysis.types === false) {
      problems = [{ kind: 'NoTypes' }, ...problems];
    }
    return { failed: false, problems, error: null };
  });
}

function summarizeKinds(problems) {
  const counts = new Map();
  for (const problem of problems) {
    const kind = problem.kind ?? 'unknown';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind} ×${count}`);
}

logStep(
  `Validating ${manifest.packages.length} tarballs (publint + attw --profile ${values['attw-profile']})`
);

const results = Array.from({ length: manifest.packages.length });
let cursor = 0;
async function worker() {
  while (cursor < manifest.packages.length) {
    const index = cursor++;
    const pkg = manifest.packages[index];
    const tgz = path.join(packsDir, pkg.file);
    const [lint, types] = await Promise.all([runPublint(tgz), runAttw(tgz)]);
    results[index] = { pkg, publint: lint, attw: types };
    const status =
      lint.errors === 0 && types.problems.length === 0 && !types.failed
        ? 'ok'
        : 'issues';
    console.log(
      `  ${status === 'ok' ? '✓' : '✗'} ${pkg.name}: publint ${lint.errors}E/${lint.warnings}W/${lint.suggestions}S, attw ${
        types.failed ? 'failed' : `${types.problems.length} problem(s)`
      }`
    );
  }
}
await Promise.all(Array.from({ length: concurrency }, worker));

const failing = results.filter(
  r => r.publint.errors > 0 || r.attw.problems.length > 0 || r.attw.failed
);
const warning = results.filter(
  r => r.publint.warnings > 0 && !failing.includes(r)
);

const summaryRows = results.map(({ pkg, publint: lint, attw }) => [
  `\`${pkg.name}\``,
  lint.errors === 0 && lint.warnings === 0
    ? lint.suggestions === 0
      ? '✓'
      : `${lint.suggestions} suggestion(s)`
    : `${lint.errors} error(s), ${lint.warnings} warning(s)`,
  attw.failed
    ? 'failed to run'
    : attw.problems.length === 0
      ? '✓'
      : summarizeKinds(attw.problems).join(', '),
]);

const details = results
  .filter(
    r =>
      r.publint.messages.length > 0 ||
      r.attw.problems.length > 0 ||
      r.attw.failed
  )
  .map(({ pkg, publint: lint, attw }) => {
    const lines = [`<details><summary><code>${pkg.name}</code></summary>`, ''];
    if (lint.messages.length > 0) {
      lines.push('publint:', '');
      for (const message of lint.messages) {
        lines.push(`- **${message.type}** ${message.text}`);
      }
      lines.push('');
    }
    if (attw.failed) {
      lines.push('arethetypeswrong:', '', `- ${attw.error}`, '');
    } else if (attw.problems.length > 0) {
      lines.push('arethetypeswrong:', '');
      for (const kind of summarizeKinds(attw.problems)) {
        lines.push(`- ${kind}`);
      }
      const samples = attw.problems.slice(0, 5);
      for (const problem of samples) {
        const where = [problem.entrypoint, problem.resolutionKind]
          .filter(Boolean)
          .join(' / ');
        lines.push(`  - ${problem.kind}${where ? ` (${where})` : ''}`);
      }
      lines.push('');
    }
    lines.push('</details>', '');
    return lines.join('\n');
  });

const report = [
  `### Package validation: ${failing.length === 0 ? 'passed' : `${failing.length} package(s) with errors`}`,
  '',
  `${results.length} tarballs checked with publint and \`attw --profile ${values['attw-profile']}\`. ` +
    `${failing.length} with errors, ${warning.length} with warnings only.`,
  '',
  mdTable(['Package', 'publint', 'arethetypeswrong'], summaryRows),
  '',
  ...details,
].join('\n');

writeReport(report, path.join(releaseDir, 'validate-report.md'));

console.log('');
for (const { pkg, publint: lint, attw } of failing) {
  console.log(`✗ ${pkg.name}`);
  for (const message of lint.messages.filter(m => m.type === 'error')) {
    console.log(`    publint error: ${message.text}`);
  }
  if (attw.failed) {
    console.log(`    attw: ${attw.error}`);
  } else if (attw.problems.length > 0) {
    console.log(`    attw: ${summarizeKinds(attw.problems).join(', ')}`);
  }
}
console.log(
  `\n${results.length} packages validated: ${failing.length} with errors, ${warning.length} with warnings only.`
);
console.log(`report: ${path.join(releaseDir, 'validate-report.md')}`);

if (
  (failOn === 'error' && failing.length > 0) ||
  (failOn === 'warning' && (failing.length > 0 || warning.length > 0))
) {
  process.exit(1);
}
