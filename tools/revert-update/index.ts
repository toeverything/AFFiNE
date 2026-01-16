import { readFileSync, writeFileSync } from 'node:fs';

import {
  applyUpdate,
  Doc,
  encodeStateAsUpdate,
  encodeStateVector,
  UndoManager,
} from 'yjs';

type InputFormat = 'file' | 'base64' | 'hex';
type OutputFormat = 'bin' | 'base64' | 'hex';

const HELP_TEXT = `
Generate a revert update from two Yjs snapshot binaries.

Usage:
  r ./tools/revert-update/index.ts --from <value> --to <value> [options]

Options:
  --from <value>         Newer snapshot input (path/base64/hex)
  --to <value>           Older snapshot input (path/base64/hex)
  --from-format <fmt>    file|base64|hex (default: file)
  --to-format <fmt>      file|base64|hex (default: file)
  --out <path>           Output path (default: stdout)
  --out-format <fmt>     bin|base64|hex (default: base64 if stdout, bin if file)
  -h, --help             Show help

Examples:
  r ./tools/revert-update/index.ts --from ./from.bin --to ./to.bin --out ./revert.bin
  r ./tools/revert-update/index.ts --from "$FROM" --from-format base64 --to "$TO" --to-format base64
`;

function generateRevertUpdate(
  fromNewerBin: Uint8Array,
  toOlderBin: Uint8Array
): Uint8Array {
  const newerDoc = new Doc();
  applyUpdate(newerDoc, fromNewerBin);
  const olderDoc = new Doc();
  applyUpdate(olderDoc, toOlderBin);

  const newerState = encodeStateVector(newerDoc);
  const olderState = encodeStateVector(olderDoc);

  const diff = encodeStateAsUpdate(newerDoc, olderState);
  const undoManager = new UndoManager(Array.from(olderDoc.share.values()));

  applyUpdate(olderDoc, diff);
  undoManager.undo();

  return encodeStateAsUpdate(olderDoc, newerState);
}

function fail(message: string): never {
  console.error(message);
  console.error(HELP_TEXT.trim());
  process.exit(1);
}

function parseInputFormat(value: string, flag: string): InputFormat {
  switch (value) {
    case 'file':
    case 'base64':
    case 'hex':
      return value;
    default:
      fail(`Unknown ${flag} value: ${value}`);
  }
}

function parseOutputFormat(value: string, flag: string): OutputFormat {
  switch (value) {
    case 'bin':
    case 'base64':
    case 'hex':
      return value;
    default:
      fail(`Unknown ${flag} value: ${value}`);
  }
}

function parseArgs(argv: string[]) {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      console.log(HELP_TEXT.trim());
      process.exit(0);
    }
    if (!arg.startsWith('--')) {
      fail(`Unknown argument: ${arg}`);
    }
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) {
      fail(`Missing value for ${arg}`);
    }
    args.set(arg, value);
    i += 1;
  }

  const from = args.get('--from');
  const to = args.get('--to');
  if (!from || !to) {
    fail('Both --from and --to are required.');
  }

  const fromFormat = parseInputFormat(
    (args.get('--from-format') ?? 'file').toLowerCase(),
    '--from-format'
  );
  const toFormat = parseInputFormat(
    (args.get('--to-format') ?? 'file').toLowerCase(),
    '--to-format'
  );

  const outPath = args.get('--out');
  const defaultOutFormat = outPath ? 'bin' : 'base64';
  const outFormat = parseOutputFormat(
    (args.get('--out-format') ?? defaultOutFormat).toLowerCase(),
    '--out-format'
  );

  return {
    from,
    to,
    fromFormat,
    toFormat,
    outPath,
    outFormat,
  };
}

function readInput(value: string, format: InputFormat): Uint8Array {
  try {
    if (format === 'file') {
      return new Uint8Array(readFileSync(value));
    }
    const trimmed = value.trim();
    const decoded = Buffer.from(trimmed, format === 'hex' ? 'hex' : 'base64');
    return new Uint8Array(decoded);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    fail(`Failed to read ${format} input: ${details}`);
  }
}

function writeOutput(
  update: Uint8Array,
  outPath: string | undefined,
  format: OutputFormat
) {
  if (outPath) {
    if (format === 'bin') {
      writeFileSync(outPath, update);
      return;
    }
    const encoded = Buffer.from(update).toString(format);
    writeFileSync(outPath, encoded);
    return;
  }

  if (format === 'bin') {
    process.stdout.write(Buffer.from(update));
    return;
  }
  const encoded = Buffer.from(update).toString(format);
  process.stdout.write(`${encoded}\n`);
}

const { from, to, fromFormat, toFormat, outPath, outFormat } = parseArgs(
  process.argv.slice(2)
);

const fromBin = readInput(from, fromFormat);
const toBin = readInput(to, toFormat);

const revertUpdate = generateRevertUpdate(fromBin, toBin);

writeOutput(revertUpdate, outPath, outFormat);
