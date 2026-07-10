#!/usr/bin/env node
/**
 * Codemod: convert physical CSS properties to logical ones in
 * vanilla-extract style files (*.css.ts), so styles mirror correctly
 * under RTL (dir="rtl").
 *
 * See docs/contributing/rtl-and-css-logical-properties.md for the
 * conventions behind this script.
 *
 * Usage:
 *   node scripts/css-logical-properties-codemod.mjs <dir-or-file>... [--write]
 *
 * Examples:
 *   # dry run (default): report what would change
 *   node scripts/css-logical-properties-codemod.mjs packages/frontend/core/src/components
 *
 *   # apply the changes
 *   node scripts/css-logical-properties-codemod.mjs packages/frontend/core --write
 *
 * What it does:
 *   - Renames physical property keys to their logical equivalents
 *     (marginLeft -> marginInlineStart, borderTopLeftRadius ->
 *     borderStartStartRadius, ...), for both camelCase identifiers and
 *     kebab-case string keys.
 *   - Rewrites textAlign: 'left' | 'right' to 'start' | 'end'.
 *   - FLAGS (but never rewrites) cases that need human judgement:
 *     bare `left`/`right` insets, translateX() transforms, and
 *     4-value margin/padding shorthands.
 *
 * The transform is idempotent: logical keys are left untouched.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

import ts from 'typescript';

const CAMEL_RENAMES = new Map(
  Object.entries({
    marginLeft: 'marginInlineStart',
    marginRight: 'marginInlineEnd',
    paddingLeft: 'paddingInlineStart',
    paddingRight: 'paddingInlineEnd',
    borderLeft: 'borderInlineStart',
    borderRight: 'borderInlineEnd',
    borderLeftWidth: 'borderInlineStartWidth',
    borderRightWidth: 'borderInlineEndWidth',
    borderLeftStyle: 'borderInlineStartStyle',
    borderRightStyle: 'borderInlineEndStyle',
    borderLeftColor: 'borderInlineStartColor',
    borderRightColor: 'borderInlineEndColor',
    borderTopLeftRadius: 'borderStartStartRadius',
    borderTopRightRadius: 'borderStartEndRadius',
    borderBottomLeftRadius: 'borderEndStartRadius',
    borderBottomRightRadius: 'borderEndEndRadius',
  })
);

const camelToKebab = s => s.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

const KEBAB_RENAMES = new Map(
  [...CAMEL_RENAMES].map(([from, to]) => [camelToKebab(from), camelToKebab(to)])
);

const TEXT_ALIGN_VALUES = new Map(
  Object.entries({ left: 'start', right: 'end' })
);

// property keys that need human judgement: `left: 0` on an absolutely
// positioned decoration usually wants insetInlineStart, but coordinates
// driven by floating-ui / drag handles / viewport math must stay physical.
const FLAG_INSETS = new Set(['left', 'right']);

const args = process.argv.slice(2);
const write = args.includes('--write');
const targets = args.filter(a => a !== '--write');

if (targets.length === 0) {
  console.error(
    'Usage: node scripts/css-logical-properties-codemod.mjs <dir-or-file>... [--write]'
  );
  process.exit(1);
}

function collectCssTsFiles(target, out) {
  const path = resolve(target);
  const stat = statSync(path);
  if (stat.isDirectory()) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') {
        continue;
      }
      collectCssTsFiles(resolve(path, entry), out);
    }
  } else if (path.endsWith('.css.ts')) {
    out.push(path);
  }
  return out;
}

/** @returns the property name text and whether it's a string literal key */
function propertyKey(node) {
  if (ts.isIdentifier(node.name)) {
    return { text: node.name.text, isString: false };
  }
  if (ts.isStringLiteral(node.name)) {
    return { text: node.name.text, isString: true };
  }
  return null;
}

function processFile(file) {
  const source = readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true
  );

  /** @type {{start: number, end: number, replacement: string}[]} */
  const edits = [];
  /** @type {{line: number, message: string}[]} */
  const changes = [];
  /** @type {{line: number, message: string}[]} */
  const flags = [];

  const lineOf = pos => sourceFile.getLineAndCharacterOfPosition(pos).line + 1;

  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const key = propertyKey(node);
      if (key) {
        const renames = key.isString ? KEBAB_RENAMES : CAMEL_RENAMES;
        const renamed = renames.get(key.text);
        const line = lineOf(node.getStart(sourceFile));

        if (renamed) {
          const replacement = key.isString ? `'${renamed}'` : renamed;
          edits.push({
            start: node.name.getStart(sourceFile),
            end: node.name.getEnd(),
            replacement,
          });
          changes.push({ line, message: `${key.text} -> ${renamed}` });
        } else if (
          (key.text === 'textAlign' || key.text === 'text-align') &&
          ts.isStringLiteralLike(node.initializer) &&
          TEXT_ALIGN_VALUES.has(node.initializer.text)
        ) {
          const value = TEXT_ALIGN_VALUES.get(node.initializer.text);
          edits.push({
            start: node.initializer.getStart(sourceFile),
            end: node.initializer.getEnd(),
            replacement: `'${value}'`,
          });
          changes.push({
            line,
            message: `textAlign: '${node.initializer.text}' -> '${value}'`,
          });
        } else if (FLAG_INSETS.has(key.text)) {
          flags.push({
            line,
            message:
              `\`${key.text}\` inset — decide manually: ` +
              `insetInline${key.text === 'left' ? 'Start' : 'End'} if it should mirror in RTL, ` +
              `keep physical if it is a computed/viewport coordinate`,
          });
        } else if (
          (key.text === 'margin' || key.text === 'padding') &&
          ts.isStringLiteralLike(node.initializer) &&
          node.initializer.text.trim().split(/\s+/).length === 4
        ) {
          flags.push({
            line,
            message:
              `4-value \`${key.text}\` shorthand — split into ` +
              `${key.text}Block/${key.text}Inline manually`,
          });
        } else if (
          ts.isStringLiteralLike(node.initializer) &&
          node.initializer.text.includes('translateX(')
        ) {
          flags.push({
            line,
            message:
              'translateX() — needs a sign flip under RTL (e.g. a :dir(rtl) override or a direction-aware variable)',
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  if (edits.length > 0 && write) {
    let output = source;
    for (const edit of edits.sort((a, b) => b.start - a.start)) {
      output =
        output.slice(0, edit.start) + edit.replacement + output.slice(edit.end);
    }
    writeFileSync(file, output);
  }

  return { changes, flags };
}

const files = targets.flatMap(t => collectCssTsFiles(t, []));
let totalChanges = 0;
let totalFlags = 0;
let changedFiles = 0;

for (const file of files) {
  const { changes, flags } = processFile(file);
  if (changes.length === 0 && flags.length === 0) continue;

  const rel = relative(process.cwd(), file);
  console.log(`\n${rel}`);
  for (const c of changes) console.log(`  L${c.line}: ${c.message}`);
  for (const f of flags) console.log(`  L${f.line}: [FLAG] ${f.message}`);

  totalChanges += changes.length;
  totalFlags += flags.length;
  if (changes.length > 0) changedFiles += 1;
}

console.log(
  `\n${files.length} files scanned, ` +
    `${totalChanges} propert${totalChanges === 1 ? 'y' : 'ies'} ` +
    `${write ? 'rewritten' : 'to rewrite'} in ${changedFiles} files, ` +
    `${totalFlags} flagged for manual review.`
);
if (!write && totalChanges > 0) {
  console.log('Dry run — pass --write to apply.');
}
