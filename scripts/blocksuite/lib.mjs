import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

export const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..'
);

/** Everything the release scripts produce lives here (gitignored via /tmp). */
export const releaseDir = path.join(rootDir, 'tmp', 'blocksuite-release');
export const defaultPacksDir = path.join(releaseDir, 'packs');
export const manifestFileName = 'manifest.json';

/** Only workspaces matching this pattern are packed and published. */
export const publishedPackagePattern = '@blocksuite/*';

export const npmRegistry = 'https://registry.npmjs.org/';

export function run(cmd, args, options = {}) {
  const { cwd = rootDir, env, stdio = 'inherit' } = options;
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio,
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `\`${cmd} ${args.join(' ')}\` exited with code ${result.status}`
    );
  }
  return result;
}

/**
 * Run a command and capture its output instead of throwing.
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function capture(cmd, args, options = {}) {
  const { cwd = rootDir, env, input } = options;
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    input,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  if (result.error) {
    throw result.error;
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function readTarString(buf, start, length) {
  const slice = buf.subarray(start, start + length);
  const end = slice.indexOf(0);
  return slice.subarray(0, end === -1 ? length : end).toString('utf8');
}

/**
 * Read one entry out of a gzipped tarball without shelling out to `tar`.
 * Good enough for `package/package.json`, which never needs long-name headers.
 */
export function readTarEntry(tgzPath, entryName) {
  const buf = gunzipSync(fs.readFileSync(tgzPath));
  let offset = 0;
  while (offset + 512 <= buf.length) {
    const header = buf.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      break;
    }
    const name = readTarString(header, 0, 100);
    const prefix = readTarString(header, 345, 155);
    const size = Number.parseInt(readTarString(header, 124, 12).trim(), 8);
    const fullName = prefix ? `${prefix}/${name}` : name;
    const dataStart = offset + 512;
    if (fullName === entryName) {
      return buf.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  throw new Error(`${entryName} not found in ${tgzPath}`);
}

export function readPackedManifest(tgzPath) {
  return JSON.parse(readTarEntry(tgzPath, 'package/package.json').toString());
}

export function loadManifest(packsDir) {
  const file = path.join(packsDir, manifestFileName);
  if (!fs.existsSync(file)) {
    throw new Error(
      `${file} does not exist. Run \`yarn blocksuite:pack\` first.`
    );
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Non-private workspaces whose name matches `publishedPackagePattern`. */
export function listPublishedWorkspaces() {
  const { status, stdout, stderr } = capture('yarn', [
    'workspaces',
    'list',
    '--json',
    '--no-private',
  ]);
  if (status !== 0) {
    throw new Error(`yarn workspaces list failed: ${stderr}`);
  }
  const prefix = publishedPackagePattern.replace(/\*$/, '');
  return stdout
    .split('\n')
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(ws => ws.name?.startsWith(prefix))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function mdTable(headers, rows) {
  const line = cells => `| ${cells.join(' | ')} |`;
  return [
    line(headers),
    line(headers.map(() => '---')),
    ...rows.map(row => line(row.map(cell => String(cell ?? '')))),
  ].join('\n');
}

/**
 * Write a markdown report to disk and, inside GitHub Actions, to the job
 * summary as well.
 */
export function writeReport(markdown, file) {
  if (file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, markdown);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
  }
}

export function logStep(title) {
  console.log(`\n==> ${title}`);
}
