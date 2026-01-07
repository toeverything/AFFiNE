#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsFolder = join(fileURLToPath(import.meta.url), '..', '..');
const scriptsSrcFolder = join(scriptsFolder, 'src');
const projectRoot = join(scriptsFolder, '..', '..');
const loader = join(scriptsFolder, 'register.js');

const [node, _self, file, ...options] = process.argv;

if (!file) {
  console.error(`Please provide a file to run, e.g. 'run src/index.{js/ts}'`);
  process.exit(1);
}

const fileLocationCandidates = new Set([
  process.cwd(),
  scriptsSrcFolder,
  projectRoot,
]);
const lookups = [];

/**
 * @type {string | undefined}
 */
let scriptLocation;
for (const location of fileLocationCandidates) {
  if (scriptLocation) {
    break;
  }

  const fileCandidates = [file, `${file}.js`, `${file}.ts`];
  for (const candidate of fileCandidates) {
    const candidateLocation = join(location, candidate);
    if (existsSync(candidateLocation)) {
      scriptLocation = candidateLocation;
      break;
    }
    lookups.push(candidateLocation);
  }
}

if (!scriptLocation) {
  console.error(
    `File ${file} not found, please make sure the first parameter passed to 'run' script is a valid js or ts file.`
  );
  console.error(`Searched locations: `);
  lookups.forEach(location => {
    console.error(`  - ${location}`);
  });
  process.exit(1);
}

const nodeOptions = [];

if (
  scriptLocation.endsWith('.ts') ||
  scriptLocation.startsWith(scriptsFolder)
) {
  nodeOptions.unshift(`--import=${pathToFileURL(loader)}`);
} else {
  nodeOptions.unshift('--experimental-specifier-resolution=node');
}

spawn(node, [...nodeOptions, scriptLocation, ...options], {
  stdio: 'inherit',
}).on('exit', code => {
  process.exit(code);
});
