// Real-yjs decode check for affine-cli's y-octo writers.
//
// Applies the fixture binaries emitted by `examples/emit_yjs_fixtures.rs` to a fresh Y.Doc
// using the REAL yjs library (same version the app pins) and asserts the decoded shapes.
// This is the only seam that can catch encodings y-octo's own reader normalizes away — the
// labelXYWH bug class: a bare top-level Any::Array stored as a Y.Map value decodes in real
// yjs to its LAST element (a scalar), which throws inside BlockSuite's renderer and poisons
// the entire edgeless surface. y-octo reads both the broken and fixed form identically, so
// no Rust test can guard this. See docs/affine-cli-edgeless-render-postmortem.md.
//
// Usage: node check.mjs <fixtures-dir>

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as Y from 'yjs';

const dir = process.argv[2] ?? '/tmp/affine-cli-yjs-fixtures';
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));

// Known merge-semantics gaps in the CLI's writers, keyed by check label. Currently empty: every
// case the harness covers is expected to pass. An entry is only ever a deliberate, documented
// record of a writer defect, reported as xfail; a known gap that starts passing is reported as
// XPASS and fails the run, so the entry must be removed together with the writer fix. Do not add
// entries to silence a new failure.
const KNOWN_GAPS = new Map([]);

let failures = 0;
let knownGaps = 0;
function check(label, cond, detail) {
  const gap = KNOWN_GAPS.get(label);
  if (gap !== undefined) {
    if (cond) {
      failures++;
      console.error(`XPASS ${label} - this known gap now passes; remove it from KNOWN_GAPS`);
    } else {
      knownGaps++;
      console.log(`xfail ${label}\n      known gap: ${gap}`);
    }
    return;
  }
  if (cond) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label}${detail === undefined ? '' : ` - got: ${JSON.stringify(detail)}`}`);
  }
}

function load(name) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, new Uint8Array(readFileSync(join(dir, name))));
  return doc;
}

const BOXED = '$blocksuite:internal:native$';

function surfaceElements(doc) {
  const blocks = doc.getMap('blocks');
  let surface;
  blocks.forEach(v => {
    if (v instanceof Y.Map && v.get('sys:flavour') === 'affine:surface') surface = v;
  });
  check('surface block found', surface !== undefined);
  const boxed = surface?.get('prop:elements');
  check('prop:elements is the Boxed wrapper', boxed instanceof Y.Map && boxed.get('type') === BOXED);
  const value = boxed?.get('value');
  check('boxed value is a Y.Map', value instanceof Y.Map);
  return value;
}

// Generic sweep over one element. The forEach is only a presence smoke-test (every top-level
// field decodes to something other than undefined); it CANNOT catch the labelXYWH bug class,
// where an array field collapses to a scalar that is still defined. That guard is the explicit
// arrayFields loop, so every array-valued field an element writes must be listed there.
function sweepElement(label, el, arrayFields) {
  check(`${label}: element is a Y.Map`, el instanceof Y.Map);
  if (!(el instanceof Y.Map)) return;
  el.forEach((v, k) => {
    check(`${label}.${k} decodes (not undefined)`, v !== undefined, v);
  });
  for (const f of arrayFields) {
    const v = el.get(f);
    check(`${label}.${f} decodes as a plain array`, Array.isArray(v), v);
  }
}

// ---------------- page doc ----------------
{
  const doc = load('page_doc.bin');
  const value = surfaceElements(doc);

  // Shape.
  const shape = value.get(manifest.shapeId);
  sweepElement('shape', shape, []);
  check('shape.type', shape?.get('type') === 'shape', shape?.get('type'));
  check('shape.xywh string', shape?.get('xywh') === '[0,0,160,80]', shape?.get('xywh'));
  check('shape.seed number', shape?.get('seed') === 11, shape?.get('seed'));
  check('shape.index is a string', typeof shape?.get('index') === 'string', shape?.get('index'));
  check('shape.fillColor', shape?.get('fillColor') === '#ffe838', shape?.get('fillColor'));
  check('shape.text is Y.Text', shape?.get('text') instanceof Y.Text);
  check('shape.text content', shape?.get('text')?.toString() === 'Box A', shape?.get('text')?.toString());

  // Text element.
  const text = value.get(manifest.textId);
  sweepElement('text', text, []);
  check('text.text content', text?.get('text')?.toString() === 'Standalone', text?.get('text')?.toString());
  const tcolor = text?.get('color');
  check(
    'text.color is a {light,dark} object',
    tcolor && typeof tcolor === 'object' && typeof tcolor.light === 'string' && typeof tcolor.dark === 'string',
    tcolor
  );

  // Connector — THE regression fixture.
  const conn = value.get(manifest.connectorId);
  sweepElement('connector', conn, ['labelXYWH']);
  const lx = conn?.get('labelXYWH');
  check(
    'connector.labelXYWH === [10,20,30,40]',
    Array.isArray(lx) && lx.length === 4 && lx[0] === 10 && lx[1] === 20 && lx[2] === 30 && lx[3] === 40,
    lx
  );
  const src = conn?.get('source');
  check('connector.source is a plain object with id', src && typeof src === 'object' && src.id === manifest.shapeId, src);
  const tgt = conn?.get('target');
  check(
    'connector.target.position === [300,200]',
    tgt && Array.isArray(tgt.position) && tgt.position[0] === 300 && tgt.position[1] === 200,
    tgt
  );
  check('connector.mode', conn?.get('mode') === 1, conn?.get('mode'));
  check('connector.text is Y.Text', conn?.get('text') instanceof Y.Text);
  const ls = conn?.get('labelStyle');
  check(
    'connector.labelStyle.color is {light,dark}',
    ls && typeof ls === 'object' && ls.color && typeof ls.color.light === 'string' && typeof ls.color.dark === 'string',
    ls
  );

  // Latex block written by `doc add-latex`.
  const blocks = doc.getMap('blocks');
  const latex = blocks.get(manifest.latexBlockId);
  check('latex block exists', latex instanceof Y.Map);
  check('latex.sys:flavour', latex?.get('sys:flavour') === 'affine:latex', latex?.get('sys:flavour'));
  check('latex.prop:latex', latex?.get('prop:latex') === manifest.latexBlockTex, latex?.get('prop:latex'));
  let note;
  blocks.forEach(v => {
    if (v instanceof Y.Map && v.get('sys:flavour') === 'affine:note') note = v;
  });
  const children = note?.get('sys:children');
  check(
    'latex block is a note child',
    children instanceof Y.Array && children.toArray().includes(manifest.latexBlockId),
    children?.toArray?.()
  );

  // Markdown math: an inline `$…$` delta and a parser-created `affine:latex` block.
  let sawInline = false;
  let sawBlockMath = false;
  blocks.forEach(v => {
    if (!(v instanceof Y.Map)) return;
    if (v.get('sys:flavour') === 'affine:paragraph') {
      const t = v.get('prop:text');
      if (t instanceof Y.Text) {
        for (const op of t.toDelta()) {
          if (op.attributes?.latex === manifest.inlineMath) sawInline = true;
        }
      }
    }
    if (v.get('sys:flavour') === 'affine:latex' && v.get('prop:latex')?.includes('\\int')) {
      sawBlockMath = true;
    }
  });
  check('inline $…$ math decodes as a latex delta attribute', sawInline);
  check('block $$…$$ math decodes as an affine:latex block', sawBlockMath);
}

// ---------------- diagram doc (single-delta create_diagram path) ----------------
{
  const doc = load('diagram_doc.bin');
  const value = surfaceElements(doc);
  for (const id of manifest.diagramShapeIds) {
    sweepElement(`diagram shape ${id}`, value.get(id), []);
  }
  for (const id of manifest.diagramConnectorIds) {
    const el = value.get(id);
    sweepElement(`diagram connector ${id}`, el, ['labelXYWH']);
    const lx = el?.get('labelXYWH');
    check(`diagram connector ${id} labelXYWH is a 4-number array`,
      Array.isArray(lx) && lx.length === 4 && lx.every(n => typeof n === 'number'), lx);
  }
  check('diagram element count', value.size === manifest.diagramShapeIds.length + manifest.diagramConnectorIds.length, value.size);
}

// ---------------- root doc ----------------
{
  const doc = load('root_doc.bin');
  const meta = doc.getMap('meta');
  check('root meta.name', meta.get('name') === manifest.workspaceName, meta.get('name'));
  const pages = meta.get('pages');
  check('root meta.pages is a Y.Array of length 1', pages instanceof Y.Array && pages.length === 1, pages?.length);
  const page = pages?.get(0);
  check('root page entry id', page instanceof Y.Map && page.get('id') === manifest.docId, page?.get?.('id'));
  check('root page entry title', page?.get('title') === manifest.docTitle, page?.get?.('title'));
}

// ---------------- db$docProperties doc ----------------
{
  const doc = load('props_doc.bin');
  const row = doc.getMap(manifest.docId);
  check('props row id', row.get('id') === manifest.docId, row.get('id'));
  check('props row primaryMode', row.get('primaryMode') === 'edgeless', row.get('primaryMode'));
}

// ============================================================================
// Per-row delta sequences.
//
// The app never applies a merged full state: it reads the `updates` rows from the workspace
// DB and applies them to a Y.Doc one by one. Every deletion-bearing CLI path (`doc update`
// structural diff, `diagram create --replace`, `remove_doc_from_root`, table row removal, key
// overwrites) therefore ships as a delta carrying a delete set, and delete-set / skip
// encoding is the historic y-octo <-> yjs divergence area. Each sequence below is the exact
// bytes `push_update` receives, in push order, with y-octo's own view of the doc after each
// row (`<i>.expected.json`) to compare against real yjs's view.
// ============================================================================

// Generic Y.Doc -> JSON projection, mirroring `value_to_json` in emit_yjs_fixtures.rs.
function toJson(v) {
  if (v instanceof Y.Text) return { $text: v.toString() };
  if (v instanceof Y.Array) return v.toArray().map(toJson);
  if (v instanceof Y.Map) {
    const out = {};
    for (const k of [...v.keys()].sort()) out[k] = toJson(v.get(k));
    return out;
  }
  if (v instanceof Y.AbstractType) return { $unsupported: v.constructor.name };
  if (v === undefined) return { $undefined: true };
  return canon(v);
}

// Plain JSON with sorted object keys so two projections compare as strings.
function canon(v) {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
    return out;
  }
  if (typeof v === 'number' && Number.isNaN(v)) return { $nan: true };
  return v;
}

function projectRoots(doc, rootNames) {
  const out = {};
  for (const name of [...rootNames].sort()) out[name] = toJson(doc.getMap(name));
  return out;
}

// First differing path between two canonical JSON values, for readable failures.
function firstDiff(a, b, path = '$') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return `${path}: array length ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of [...keys].sort()) {
      if (!(k in a)) return `${path}.${k}: missing in expected (y-octo view), present in yjs`;
      if (!(k in b)) return `${path}.${k}: present in expected (y-octo view), missing in yjs`;
      const d = firstDiff(a[k], b[k], `${path}.${k}`);
      if (d) return d;
    }
  }
  return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
}

function readJson(name) {
  return JSON.parse(readFileSync(join(dir, name), 'utf8'));
}

function applyRow(doc, name) {
  Y.applyUpdate(doc, new Uint8Array(readFileSync(join(dir, name))));
}

function noPending(doc) {
  return doc.store.pendingStructs === null && doc.store.pendingDs === null;
}

function blocksByFlavour(doc, flavour) {
  const out = [];
  doc.getMap('blocks').forEach((v, k) => {
    if (v instanceof Y.Map && v.get('sys:flavour') === flavour) out.push([k, v]);
  });
  return out;
}

const sequences = manifest.sequences ?? [];
check('manifest lists delta sequences', sequences.length > 0, sequences.length);

const bySeq = new Map();
for (const seq of sequences) {
  const label = `seq ${seq.name}`;
  const doc = new Y.Doc();
  let lastExpected = null;
  seq.rows.forEach((row, i) => {
    let threw = null;
    try {
      applyRow(doc, row);
    } catch (e) {
      threw = e;
    }
    check(`${label} row ${i} applies without throwing`, threw === null, threw?.message);
    check(`${label} row ${i} leaves no pending structs / delete sets`, noPending(doc), {
      pendingStructs: doc.store.pendingStructs !== null,
      pendingDs: doc.store.pendingDs !== null,
    });
    const expected = canon(readJson(seq.expected[i]));
    lastExpected = expected;
    const rootNames = Object.keys(expected.roots);
    const shareNames = [...doc.share.keys()].sort();
    check(`${label} row ${i} root type names match`, JSON.stringify(shareNames) === JSON.stringify(rootNames), {
      yjs: shareNames,
      yocto: rootNames,
    });
    const actual = canon(projectRoots(doc, rootNames));
    const diff = firstDiff(expected.roots, actual);
    check(`${label} row ${i} yjs view matches y-octo view`, diff === null, diff);
  });

  // Re-encoding the yjs-side result and replaying it into a fresh doc must reproduce the
  // same state (the app persists a yjs-encoded full snapshot on compaction).
  {
    const fresh = new Y.Doc();
    let threw = null;
    try {
      Y.applyUpdate(fresh, Y.encodeStateAsUpdate(doc));
    } catch (e) {
      threw = e;
    }
    check(`${label} encodeStateAsUpdate re-applies to a fresh doc`, threw === null, threw?.message);
    const rootNames = Object.keys(lastExpected.roots);
    const diff = firstDiff(canon(projectRoots(doc, rootNames)), canon(projectRoots(fresh, rootNames)));
    check(`${label} re-encoded state equals the row-by-row state`, diff === null, diff);
  }

  // Tie the yjs view back to what the CLI's own reader printed for the final state.
  const reader = lastExpected.reader;
  if (seq.kind === 'page' && reader) {
    const blocks = doc.getMap('blocks');
    for (const b of reader.blocks) {
      const m = blocks.get(b.block_id);
      check(
        `${label} reader block ${b.block_id} (${b.flavour}) exists in yjs with the same flavour`,
        m instanceof Y.Map && m.get('sys:flavour') === b.flavour,
        m?.get?.('sys:flavour')
      );
    }
  }
  if (seq.kind === 'root' && reader) {
    const pages = doc.getMap('meta').get('pages');
    const ids = pages instanceof Y.Array ? pages.toArray().filter(p => p.get('trash') !== true).map(p => p.get('id')) : null;
    check(
      `${label} reader page ids equal yjs meta.pages ids`,
      JSON.stringify(ids) === JSON.stringify(reader.pages.map(p => p.id)),
      { yjs: ids, reader: reader.pages.map(p => p.id) }
    );
  }
  bySeq.set(seq.name, { seq, lastExpected });
}

// ============================================================================
// Interleaving: a CLI delta applied on top of a doc that already carries a concurrent,
// app-style edit made with real yjs. This is the merge-semantics risk from #15361: the CLI
// computed its delta against the DB state it read, the app edited in between, and both
// edits must survive.
// ============================================================================

// Doc state right before row `rowIndex` of a sequence.
function docBefore(seqName, rowIndex) {
  const { seq } = bySeq.get(seqName);
  const doc = new Y.Doc();
  for (let i = 0; i < rowIndex; i++) applyRow(doc, seq.rows[i]);
  return { doc, seq };
}

// Insert a paragraph the way BlockSuite does: a Y.Map in `blocks` with sys:*/prop:* fields,
// then its id appended to the note's `sys:children`.
function appInsertParagraph(doc, id, text) {
  const blocks = doc.getMap('blocks');
  const [, note] = blocksByFlavour(doc, 'affine:note')[0];
  doc.transact(() => {
    const m = new Y.Map();
    blocks.set(id, m);
    m.set('sys:id', id);
    m.set('sys:flavour', 'affine:paragraph');
    m.set('sys:version', 1);
    m.set('sys:children', new Y.Array());
    m.set('prop:type', 'text');
    const t = new Y.Text();
    m.set('prop:text', t);
    t.insert(0, text);
    note.get('sys:children').push([id]);
  });
}

function noteChildren(doc) {
  const [, note] = blocksByFlavour(doc, 'affine:note')[0];
  return note.get('sys:children').toArray();
}

function paragraphTexts(doc) {
  return blocksByFlavour(doc, 'affine:paragraph').map(([, m]) => m.get('prop:text')?.toString());
}

// A. App appends a paragraph; CLI edits the text of another paragraph (update_text row 1).
{
  const label = 'interleave A (app paragraph + CLI text edit)';
  const { doc, seq } = docBefore('update_text', 1);
  appInsertParagraph(doc, 'app-para-a', 'app paragraph');
  let threw = null;
  try {
    applyRow(doc, seq.rows[1]);
  } catch (e) {
    threw = e;
  }
  check(`${label}: CLI delta applies`, threw === null, threw?.message);
  check(`${label}: no pending structs`, noPending(doc));
  const texts = paragraphTexts(doc);
  check(`${label}: CLI text edit survived`, texts.includes('Hello brave new world'), texts);
  check(`${label}: app paragraph block survived`, texts.includes('app paragraph'), texts);
  check(`${label}: app paragraph still in note children`, noteChildren(doc).includes('app-para-a'), noteChildren(doc));
}

// B. App appends a paragraph; CLI structural diff removes/reorders blocks (update_structural row 1).
{
  const label = 'interleave B (app paragraph + CLI structural diff)';
  const { doc, seq } = docBefore('update_structural', 1);
  appInsertParagraph(doc, 'app-para-b', 'app paragraph');
  let threw = null;
  try {
    applyRow(doc, seq.rows[1]);
  } catch (e) {
    threw = e;
  }
  check(`${label}: CLI delta applies`, threw === null, threw?.message);
  check(`${label}: no pending structs`, noPending(doc));
  const { lastExpected } = bySeq.get('update_structural');
  const expectedNote = Object.values(lastExpected.roots.blocks).find(b => b['sys:flavour'] === 'affine:note');
  const children = noteChildren(doc);
  const cliOrder = children.filter(id => id !== 'app-para-b');
  check(
    `${label}: CLI reorder/removal survived`,
    JSON.stringify(cliOrder) === JSON.stringify(expectedNote['sys:children']),
    { yjs: cliOrder, expected: expectedNote['sys:children'] }
  );
  check(`${label}: app paragraph block survived`, paragraphTexts(doc).includes('app paragraph'), paragraphTexts(doc));
  check(`${label}: app paragraph still in note children`, children.includes('app-para-b'), children);
}

// C. App types inside the SAME paragraph the CLI edits (update_text row 1).
{
  const label = 'interleave C (app typing + CLI edit in the same paragraph)';
  const { doc, seq } = docBefore('update_text', 1);
  const [, para] = blocksByFlavour(doc, 'affine:paragraph').find(([, m]) => m.get('prop:text')?.toString() === 'Hello world');
  doc.transact(() => {
    const t = para.get('prop:text');
    t.insert(t.length, ' (app)');
  });
  let threw = null;
  try {
    applyRow(doc, seq.rows[1]);
  } catch (e) {
    threw = e;
  }
  check(`${label}: CLI delta applies`, threw === null, threw?.message);
  check(`${label}: no pending structs`, noPending(doc));
  const text = para.get('prop:text')?.toString();
  check(`${label}: CLI edit survived`, typeof text === 'string' && text.includes('brave new'), text);
  check(`${label}: app typing survived`, typeof text === 'string' && text.includes('(app)'), text);
}

// D. App registers a page in meta.pages; CLI removes a different page (root_remove last row).
{
  const label = 'interleave D (app meta.pages push + CLI remove_doc_from_root)';
  const { seq } = bySeq.get('root_remove');
  const last = seq.rows.length - 1;
  const { doc } = docBefore('root_remove', last);
  doc.transact(() => {
    const m = new Y.Map();
    doc.getMap('meta').get('pages').push([m]);
    m.set('id', 'app-doc');
    m.set('title', 'App doc');
    m.set('createDate', Date.now());
    m.set('tags', new Y.Array());
  });
  let threw = null;
  try {
    applyRow(doc, seq.rows[last]);
  } catch (e) {
    threw = e;
  }
  check(`${label}: CLI delta applies`, threw === null, threw?.message);
  check(`${label}: no pending structs`, noPending(doc));
  const ids = doc.getMap('meta').get('pages').toArray().map(p => p.get('id'));
  check(`${label}: CLI removal survived (doc-a gone)`, !ids.includes('doc-a'), ids);
  check(`${label}: app page survived`, ids.includes('app-doc'), ids);
  check(`${label}: untouched page survived`, ids.includes('doc-b'), ids);
}

// E. App adds a surface element; CLI `diagram create --replace` (diagram_replace last row).
{
  const label = 'interleave E (app surface element + CLI diagram --replace)';
  const { seq } = bySeq.get('diagram_replace');
  const last = seq.rows.length - 1;
  const { doc } = docBefore('diagram_replace', last);
  const [, surface] = blocksByFlavour(doc, 'affine:surface')[0];
  const value = surface.get('prop:elements').get('value');
  const before = [...value.keys()];
  doc.transact(() => {
    const el = new Y.Map();
    value.set('app-el', el);
    el.set('id', 'app-el');
    el.set('type', 'shape');
    el.set('shapeType', 'rect');
    el.set('xywh', '[500,500,100,100]');
    el.set('index', 'a9');
    el.set('seed', 99);
    el.set('rotate', 0);
  });
  let threw = null;
  try {
    applyRow(doc, seq.rows[last]);
  } catch (e) {
    threw = e;
  }
  check(`${label}: CLI delta applies`, threw === null, threw?.message);
  check(`${label}: no pending structs`, noPending(doc));
  const after = [...value.keys()];
  check(`${label}: CLI clear removed the prior elements`, before.every(k => !after.includes(k)), { before, after });
  check(`${label}: app element survived`, after.includes('app-el'), after);
  const { lastExpected } = bySeq.get('diagram_replace');
  const expectedSurface = Object.values(lastExpected.roots.blocks).find(b => b['sys:flavour'] === 'affine:surface');
  const expectedIds = Object.keys(expectedSurface['prop:elements'].value);
  check(`${label}: CLI new elements present`, expectedIds.every(k => after.includes(k)), { expectedIds, after });
}

if (knownGaps > 0) {
  console.log(`\n${knownGaps} known merge-semantics gap(s) reported as xfail (see KNOWN_GAPS).`);
}
if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED - CLI-written updates do not decode or merge correctly in real yjs.`);
  process.exit(1);
}
console.log('\nall real-yjs decode checks passed');
