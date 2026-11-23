import path from 'node:path';

import { getDisplayLabel, readYjsDocFromFile } from './io';
import { extractRootDocPagesMeta, printRootDocPairDiff } from './rootdoc';
import {
  extractYjsTable,
  printFavoritePairDiff,
  printFolderPairDiff,
} from './table';

type Mode = 'rootdoc' | 'folder' | 'favorite';

const HELP_TEXT = `
Diff AFFiNE Yjs snapshot docs between multiple binaries.

Usage:
  # Root doc: diff meta.pages
  r ./tools/doc-diff/index.ts <rootDoc1.bin> <rootDoc2.bin> [...more]
  r ./tools/doc-diff/index.ts root <rootDoc1.bin> <rootDoc2.bin> [...more]

  # Organize: diff db$...$folder (table doc)
  r ./tools/doc-diff/index.ts folder <folderDoc1.bin> <folderDoc2.bin> [...more]

  # Favorites: diff userdata$...$favorite (table doc)
  r ./tools/doc-diff/index.ts favorite <favoriteDoc1.bin> <favoriteDoc2.bin> [...more]

Notes:
  - Every argument after the optional subcommand is treated as a file path (relative or absolute).
  - Files must be the same doc type (no mixing).
`.trim();

function fail(message: string): never {
  console.error(message);
  console.error('');
  console.error(HELP_TEXT);
  process.exit(1);
}

function parseMode(value: string): Mode | null {
  switch (value.toLowerCase()) {
    case 'root':
    case 'rootdoc':
    case 'meta':
      return 'rootdoc';
    case 'folder':
    case 'folders':
      return 'folder';
    case 'favorite':
    case 'favourite':
    case 'favorites':
      return 'favorite';
    default:
      return null;
  }
}

function parseArgs(argv: string[]) {
  if (argv.some(arg => arg === '-h' || arg === '--help')) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  let mode: Mode = 'rootdoc';
  let cursor = 0;
  const maybeMode = argv[cursor];
  if (maybeMode) {
    if (maybeMode.startsWith('-')) {
      fail(`Unknown argument: ${maybeMode}`);
    }
    const parsed = parseMode(maybeMode);
    if (parsed) {
      mode = parsed;
      cursor += 1;
    }
  }

  const files = argv.slice(cursor);
  for (const file of files) {
    if (file.startsWith('-')) {
      fail(`Unknown argument: ${file}`);
    }
  }
  if (files.length < 2) {
    fail('Please provide at least two snapshot file paths.');
  }

  return { mode, files };
}

const { mode, files } = parseArgs(process.argv.slice(2));
const resolvedFiles = files.map(f => path.resolve(process.cwd(), f));

const docs = resolvedFiles.map(filePath => {
  try {
    return readYjsDocFromFile(filePath);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    return fail(`Failed to read/parse snapshot file "${filePath}": ${details}`);
  }
});

switch (mode) {
  case 'rootdoc': {
    const metas = docs.map(extractRootDocPagesMeta);
    for (let i = 0; i < files.length - 1; i += 1) {
      printRootDocPairDiff({
        fromLabel: getDisplayLabel(files[i]!),
        toLabel: getDisplayLabel(files[i + 1]!),
        fromMeta: metas[i]!,
        toMeta: metas[i + 1]!,
      });
    }
    break;
  }
  case 'folder': {
    const tables = docs.map(doc => extractYjsTable(doc, 'id'));
    for (let i = 0; i < files.length - 1; i += 1) {
      printFolderPairDiff({
        fromLabel: getDisplayLabel(files[i]!),
        toLabel: getDisplayLabel(files[i + 1]!),
        fromTable: tables[i]!,
        toTable: tables[i + 1]!,
      });
    }
    break;
  }
  case 'favorite': {
    const tables = docs.map(doc => extractYjsTable(doc, 'key'));
    for (let i = 0; i < files.length - 1; i += 1) {
      printFavoritePairDiff({
        fromLabel: getDisplayLabel(files[i]!),
        toLabel: getDisplayLabel(files[i + 1]!),
        fromTable: tables[i]!,
        toTable: tables[i + 1]!,
      });
    }
    break;
  }
  default: {
    const unreachableMode: never = mode;
    fail(`Unknown mode: ${unreachableMode}`);
  }
}
