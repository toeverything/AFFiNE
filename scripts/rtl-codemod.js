#!/usr/bin/env node
/**
 * AFFiNE RTL Codemod
 * Converts CSS physical properties to logical properties for RTL support.
 * Usage: node scripts/rtl-codemod.js [--dry-run] [path]
 */

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const targetPath = args.find(a => !a.startsWith('--')) || '.';

const rules = [
  // kebab-case (standard CSS)
  { from: /\bmargin-left\b/g,   to: 'margin-inline-start' },
  { from: /\bmargin-right\b/g,  to: 'margin-inline-end' },
  { from: /\bpadding-left\b/g,  to: 'padding-inline-start' },
  { from: /\bpadding-right\b/g, to: 'padding-inline-end' },
  { from: /\bborder-left\s*:/g,    to: 'border-inline-start:' },
  { from: /\bborder-right\s*:/g,   to: 'border-inline-end:' },
  { from: /\bborder-left-width\b/g,  to: 'border-inline-start-width' },
  { from: /\bborder-right-width\b/g, to: 'border-inline-end-width' },
  { from: /\bborder-left-color\b/g,  to: 'border-inline-start-color' },
  { from: /\bborder-right-color\b/g, to: 'border-inline-end-color' },

  // camelCase (vanilla-extract CSS-in-JS)
  { from: /\bmarginLeft\b/g,         to: 'marginInlineStart' },
  { from: /\bmarginRight\b/g,        to: 'marginInlineEnd' },
  { from: /\bpaddingLeft\b/g,        to: 'paddingInlineStart' },
  { from: /\bpaddingRight\b/g,       to: 'paddingInlineEnd' },
  { from: /\bborderLeft\b/g,         to: 'borderInlineStart' },
  { from: /\bborderRight\b/g,        to: 'borderInlineEnd' },
  { from: /\bborderLeftWidth\b/g,    to: 'borderInlineStartWidth' },
  { from: /\bborderRightWidth\b/g,   to: 'borderInlineEndWidth' },
  { from: /\bborderLeftColor\b/g,    to: 'borderInlineStartColor' },
  { from: /\bborderRightColor\b/g,   to: 'borderInlineEndColor' },
];

const EXTENSIONS = ['.ts', '.tsx', '.css'];
const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '.yarn'];

let totalFiles = 0, changedFiles = 0, totalChanges = 0;

function processFile(filePath) {
  if (!EXTENSIONS.includes(path.extname(filePath))) return;
  totalFiles++;
  const original = fs.readFileSync(filePath, 'utf8');
  let result = original;
  let changes = 0;
  for (const rule of rules) {
    const matches = result.match(rule.from);
    if (matches) { changes += matches.length; result = result.replace(rule.from, rule.to); }
  }
  if (changes > 0) {
    changedFiles++;
    totalChanges += changes;
    console.log(`  [${changes}] ${filePath}`);
    if (!dryRun) fs.writeFileSync(filePath, result, 'utf8');
  }
}

function walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.includes(entry.name)) walkDir(path.join(dir, entry.name));
    } else {
      processFile(path.join(dir, entry.name));
    }
  }
}

const resolvedPath = path.resolve(targetPath);
if (!fs.existsSync(resolvedPath)) {
  console.error(`Error: Path does not exist: ${resolvedPath}`);
  process.exit(1);
}

console.log(`\nAFFiNE RTL Codemod ${dryRun ? '(DRY RUN)' : ''}\nTarget: ${resolvedPath}\n`);
const stat = fs.statSync(resolvedPath);
stat.isDirectory() ? walkDir(resolvedPath) : processFile(resolvedPath);
console.log(`\nFiles scanned: ${totalFiles} | Changed: ${changedFiles} | Total replacements: ${totalChanges}`);
if (dryRun) console.log('(Dry run — no files modified)');
