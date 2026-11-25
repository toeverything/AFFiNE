#!/usr/bin/env node
// Regenerates `blocksuite/crates/editor/tests/fixtures/fuse_v710_oracle.json`
// from real `fuse.js@7.1.0` with the exact AFFiNE 0.27.5 picker options:
// `{ keys: ['title'], includeMatches: true, includeScore: true, ignoreLocation: true, threshold: 0.0 }`.
//
// Usage:
//   node blocksuite/crates/editor/scripts/gen-fuse-oracle.mjs /path/to/fuse.mjs

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const fusePath = process.argv[2] || '/tmp/fuse-7.1.0/package/dist/fuse.mjs';
const { default: Fuse } = await import(pathToFileURL(path.resolve(fusePath)).href);

const opts = {
  keys: ['title'],
  includeMatches: true,
  includeScore: true,
  ignoreLocation: true,
  threshold: 0.0,
};

const head32 = 'abcdefghijklmnopqrstuvwxyz012345'; // exactly 32 UTF-16 units
const long33 = head32 + '6'; // 33 UTF-16 units (2 chunks: 32 + 1)
const long36 = head32 + '6789'; // 36 UTF-16 units (2 chunks: 32 + 4)

const cases = [
  { label: 'highlight-engineering', titles: ['Engineering'], query: 'gin' },
  { label: 'highlight-cool-doc', titles: ['A cool doc'], query: 'doc' },
  { label: 'highlight-roadmap', titles: ['Project Roadmap'], query: 'roadmap' },
  { label: 'highlight-banana', titles: ['banana'], query: 'an' },
  { label: 'highlight-alpha', titles: ['Alpha Beta Alpha'], query: 'ALPHA' },
  { label: 'highlight-emoji', titles: ['🚀 Launch Plan'], query: 'launch' },
  { label: 'highlight-zwj-emoji', titles: ['👨‍👩‍👧‍👦 Family'], query: 'family' },
  { label: 'highlight-shared-surrogate', titles: ['🔥 🚀'], query: '🚀' },
  { label: 'rank-design', titles: ['Mobile Design Spec', 'Design System', 'Design'], query: 'design' },
  { label: 'rank-tokens', titles: ['a b c', 'abcdefgh'], query: 'a' },
  { label: 'rank-same-tokens', titles: ['abcdefghijkl', 'ab'], query: 'ab' },
  { label: 'sigma-final-miss', titles: ['ΟΔΟΣ'], query: 'οσ' },
  { label: 'sigma-upper-hit', titles: ['ΟΔΟΣ'], query: 'ΟΣ' },
  { label: 'sigma-os-lower-final-hit', titles: ['ΟΣ'], query: 'ος' },
  { label: 'sigma-os-lower-medial-miss', titles: ['ΟΣ'], query: 'οσ' },
  { label: 'sigma-final-vs-medial', titles: ['ς'], query: 'σ' },
  { label: 'dotted-i', titles: ['İstanbul'], query: 'i' },
  { label: 'dotted-i-bul', titles: ['İstanbul'], query: 'bul' },
  { label: 'dotted-i-ab', titles: ['İab'], query: 'a' },
  { label: 'dotted-i-x', titles: ['İx'], query: 'x' },
  { label: 'trailing-space', titles: ['Foo Bar', 'Foobar'], query: 'Foo ' },
  { label: 'spaces-only', titles: ['Anything', 'Any thing'], query: '   ' },
  { label: 'empty-query', titles: ['Alpha', 'Beta'], query: '' },
  { label: 'long-exact-32', titles: ['xx ' + head32 + ' yy'], query: head32 },
  { label: 'long-exact-33', titles: ['xx ' + long33 + ' yy'], query: long33 },
  { label: 'long-full', titles: ['xx ' + long36 + ' yy'], query: long36 },
  { label: 'long-first-chunk-only', titles: ['xx ' + head32 + ' yy'], query: long36 },
  { label: 'long-no-chunk', titles: ['unrelated title'], query: long36 },
  { label: 'long-exact-full-field', titles: [long36], query: long36 },
];

const fixture = {
  fuse_version: '7.1.0',
  options: opts,
  cases: cases.map(({ label, titles, query }) => {
    const fuse = new Fuse(
      titles.map((title) => ({ title })),
      opts
    );
    const results = fuse.search(query).map((r) => ({
      title: r.item.title,
      ref_index: r.refIndex,
      score: r.score,
      indices: (r.matches || []).flatMap((m) =>
        m.indices.map(([s, e]) => [s, e + 1])
      ),
    }));
    return { label, titles, query, results };
  }),
};

const scriptDir = path.dirname(new URL(import.meta.url).pathname);
const outPath = path.resolve(scriptDir, '../tests/fixtures/fuse_v710_oracle.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(fixture, null, 2) + '\n');
console.log(`Wrote ${fixture.cases.length} cases to ${outPath}`);
