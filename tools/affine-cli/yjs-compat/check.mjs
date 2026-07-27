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

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`ok   ${label}`);
  } else {
    failures++;
    console.error(`FAIL ${label}${detail === undefined ? '' : ` — got: ${JSON.stringify(detail)}`}`);
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

// Generic sweep over one element: every top-level field must decode to SOMETHING (a field
// decoding to undefined, or an array field decoding to a scalar, is the bug class). Fields
// listed in arrayFields must decode as real JS arrays.
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

if (failures > 0) {
  console.error(`\n${failures} check(s) FAILED — y-octo output does not decode correctly in real yjs.`);
  process.exit(1);
}
console.log('\nall real-yjs decode checks passed');
