import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, vi } from 'vitest';
import * as Y from 'yjs';

import { ConnectorPathGenerator } from '../../affine/gfx/connector/src/connector-manager';
import { shapeMethods } from '../../affine/model/src/elements/shape/api';
import { RoughGenerator } from '../../affine/blocks/surface/src/utils/rough/generator';
import { rect } from '../../affine/gfx/shape/src/element-renderer/shape/rect';
import { diamond } from '../../affine/gfx/shape/src/element-renderer/shape/diamond';
import { ellipse } from '../../affine/gfx/shape/src/element-renderer/shape/ellipse';
import { triangle } from '../../affine/gfx/shape/src/element-renderer/shape/triangle';
import { getSolidStrokePoints } from '../../framework/global/src/gfx/perfect-freehand/get-solid-stroke-points';
import { getSvgPathFromStroke } from '../../framework/global/src/gfx/math';

const fixture = fileURLToPath(
  new URL('./surface-oracle.json', import.meta.url)
);
const gfxTextUtilsPath = fileURLToPath(
  new URL('../../affine/gfx/text/src/element-renderer/utils.ts', import.meta.url)
);

function rtlChecks() {
  const src = readFileSync(gfxTextUtilsPath, 'utf8');
  const rsLtr =
    'A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u0590\u0800-\u1FFF' +
    '\u2C00-\uFB1C\uFDFE-\uFE6F\uFEFD-\uFFFF';
  const rsRtl = '\u0591-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC';
  expect(src).toContain(
    "'A-Za-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02B8\\u0300-\\u0590\\u0800-\\u1FFF'"
  );
  expect(src).toContain("'\\u0591-\\u07FF\\uFB1D-\\uFDFD\\uFE70-\\uFEFC'");
  // oxlint-disable-next-line no-misleading-character-class
  const reRtlCheck = new RegExp(`^[^${rsLtr}]*[${rsRtl}]`);
  return [
    '',
    'Hello',
    '\u0661A',
    'A\u0661',
    '123 \u0645\u0631\u062D\u0628\u0627',
    '(\u05E9\u05DC\u05D5\u05DD)',
    '\uD83D\uDE00\u0645\u0631\u062D\u0628\u0627',
    '\uFB1D test',
    '\uFE70',
    '\uFB1C\u0591',
  ].map(text => ({ text, rtl: reRtlCheck.test(text) }));
}

function model(shape, bounds, rotate = 0) {
  const [x, y, w, h] = bounds;
  const element = { x, y, w, h, rotate, xywh: JSON.stringify(bounds) };
  const methods = shapeMethods[shape];
  element.getLineIntersections = (a, b) =>
    methods.getLineIntersections(a, b, element);
  element.getRelativePointLocation = p =>
    methods.getRelativePointLocation(p, element);
  return element;
}

function connectors() {
  const results = [];
  for (const [shape, rotate, first, second] of [
    ['rect', 0, [0, 0, 100, 100], [20, 110, 180, 45]],
    ['rect', 0, [0, 0, 80, 120], [157, 53, 90, 60]],
    ['triangle', 0, [0, 0, 100, 100], [200, 15, 47, 70]],
    ['triangle', 37, [0, 0, 100, 100], [200, 15, 47, 70]],
    ['diamond', 0, [130, 170, 80, 60], [10, 0, 100, 40]],
    ['ellipse', 27, [20, 20, 90, 60], [138, 78, 55, 34]],
  ]) {
    const elements = {
      a: model(shape, first, rotate),
      b: model('rect', second),
    };
    for (const mode of [0, 1, 2]) {
      for (const [source, target] of [
        [{ id: 'a' }, { id: 'b' }],
        [{ id: 'a', position: [0.5, 0.5] }, { id: 'b' }],
        [
          { id: 'a', position: [1, 0.5] },
          { id: 'b', position: [0.5, 0] },
        ],
        [{ id: 'a' }, { position: [147, 91] }],
        [{ position: [22, 17] }, { position: [170, 84] }],
      ]) {
        const connector = { source, target, mode };
        ConnectorPathGenerator.updatePath(connector, null, id => elements[id]);
        const [x, y] = JSON.parse(connector.xywh);
        const path = connector.path.map(p => {
          const point = p.clone().setVec([p[0] + x, p[1] + y]);
          return {
            point: point.toVec(),
            ...(mode === 2
              ? { incoming: point.absIn, outgoing: point.absOut }
              : {}),
          };
        });
        results.push({
          shape,
          rotate,
          first,
          second,
          source,
          target,
          mode,
          path,
        });
      }
    }
  }
  return results;
}

function scribbles() {
  const results = [];
  for (const seed of [-14791, 9])
    for (const [shape, radius, roughness = 1.4] of [
      ['rect', 0],
      ['rect', 0.1],
      ['ellipse', 0],
      ['ellipse', 0, 0],
      ['diamond', 0],
      ['triangle', 0],
    ]) {
      const g = new RoughGenerator();
      let sets;
      const canvas = new Proxy(
        {},
        {
          get:
            (_, prop) =>
            (...args) => {
              sets = g[prop](...args).sets;
            },
        }
      );
      const matrix = {
        translateSelf() {
          return this;
        },
        rotateSelf() {
          return this;
        },
      };
      const ctx = {
        setTransform() {},
        getTransform() {
          return matrix;
        },
      };
      const bounds = [0, 0, 36, 24],
        width = 2;
      ({ rect, triangle, diamond, ellipse })[shape](
        {
          filled: true,
          radius,
          rotate: 0,
          roughness,
          seed,
          shapeStyle: 'Scribbled',
          strokeStyle: 'solid',
          strokeWidth: width,
          deserializedXYWH: bounds,
        },
        ctx,
        matrix,
        {},
        canvas,
        { fillColor: '#abc', strokeColor: '#123' }
      );
      results.push({ shape, radius, bounds, width, roughness, seed, sets });
    }
  return results;
}

function layerUpdates() {
  const doc = new Y.Doc();
  doc.clientID = 132;
  const blocks = doc.getMap('blocks');
  const map = fields => new Y.Map(Object.entries(fields));
  function block(id, type, ids, props) {
    const children = new Y.Array();
    children.push(ids);
    blocks.set(id, map({
      'sys:id': id, 'sys:flavour': 'affine:' + type, 'sys:version': 1,
      'sys:children': children, ...props,
    }));
  }
  const shape = map({ id: 'shape', type: 'shape', index: 'a1', shapeType: 'rect',
    xywh: '[20,20,100,100]', filled: true, fillColor: '#ff0000', strokeStyle: 'none' });
  const stroke = map({id: 'ink', type: 'highlighter', index: 'a2', color: 'rgba(0, 0, 255, 1)',
    xywh: '[140,30,150,90]', points: [[0,40,1],[45,40,1],[85,40,1],[35,43,1],[18,46,1],[86,50,1],[140,50,1]],
    lineWidth: 16});
  block('page', 'page', ['surface','note'], {});
  block('surface', 'surface', [], { 'prop:elements': map({value: map({shape, ink:stroke})}) });
  block('note', 'note', [], { 'prop:xywh':'[10,10,120,120]', 'prop:index':'a5', 'prop:background':'#00ff00' });
  const initial = Array.from(Y.encodeStateAsUpdate(doc));
  const vector = Y.encodeStateVector(doc);
  shape.set('index','a8');
  return { initial, bringToFront: Array.from(Y.encodeStateAsUpdate(doc, vector)) };
}

test('surface geometry agrees with the BlockSuite renderers', () => {
  // Node does not provide the CSSOM point/quad value types used by Bound.
  class Rect {
    constructor(x, y, width, height) {
      Object.assign(this, { x, y, width, height });
    }
  }
  vi.stubGlobal('DOMRect', Rect);
  vi.stubGlobal(
    'DOMPoint',
    class {
      constructor(x, y) {
        Object.assign(this, { x, y });
      }
      matrixTransform(m) {
        return m.transform(this);
      }
    }
  );
  vi.stubGlobal(
    'DOMMatrix',
    class {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      translateSelf(x, y) {
        this.e += this.a * x + this.c * y;
        this.f += this.b * x + this.d * y;
        return this;
      }
      rotateSelf(deg) {
        const c = Math.cos((deg * Math.PI) / 180),
          s = Math.sin((deg * Math.PI) / 180),
          { a, b, c: C, d } = this;
        Object.assign(this, {
          a: a * c + C * s,
          b: b * c + d * s,
          c: -a * s + C * c,
          d: -b * s + d * c,
        });
        return this;
      }
      transform({ x, y }) {
        return {
          x: this.a * x + this.c * y + this.e,
          y: this.b * x + this.d * y + this.f,
        };
      }
    }
  );
  vi.stubGlobal(
    'DOMQuad',
    class {
      constructor(...points) {
        this.points = points;
      }
      getBounds() {
        const xs = this.points.map(p => p.x),
          ys = this.points.map(p => p.y);
        const x = Math.min(...xs),
          y = Math.min(...ys);
        return new Rect(x, y, Math.max(...xs) - x, Math.max(...ys) - y);
      }
    }
  );
  const group = new Y.Doc().getMap('children');
  group.set('z', false);
  group.set('a', true);
  const strokes = [
    [
      [2, 3],
      [10, 7],
      [27, 19],
      [39, 15],
      [37, 11],
    ],
    [
      [2, 3, 0.1],
      [10, 7, 0.2],
      [27, 19, 0.65],
      [39, 15, 0.9],
      [37, 11, 0.3],
    ],
    [[8, 3]],
    [
      [2, 8],
      [9, 3],
    ],
  ].map(input => {
    const width = 8;
    const outline = getSolidStrokePoints(input, width);
    return { input, width, outline, svg: getSvgPathFromStroke(outline) };
  });
  const result = {
    layers: layerUpdates(),
    connectors: connectors(),
    scribbles: scribbles(),
    strokes,
    children: Array.from(group.keys()).sort(),
    rtlChecks: rtlChecks(),
  };
  if (process.env.SURFACE_ORACLE_OUT)
    writeFileSync(
      process.env.SURFACE_ORACLE_OUT,
      JSON.stringify(result) + '\n'
    );
  else expect(JSON.parse(readFileSync(fixture, 'utf8'))).toEqual(result);
});
