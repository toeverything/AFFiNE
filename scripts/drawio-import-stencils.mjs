import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/workspace/drawio/src/main/webapp/stencils';
const OUTPUT =
  '/workspace/AFFiNE/blocksuite/affine/gfx/shape/src/drawio/stencils.ts';

const SOURCES = [
  {
    file: 'flowchart.xml',
    include: [
      'Process',
      'Decision',
      'Data',
      'Document',
      'Manual Input',
      'Delay',
      'Predefined Process',
      'Stored Data',
      'Internal Storage',
      'Database',
      'Sequential Data',
      'Terminator',
      'Preparation',
      'Merge or Storage',
      'Paper Tape',
      'Annotation 1',
      'Annotation 2',
      'Card',
      'Collate',
      'Direct Data',
      'Display',
      'Loop Limit',
      'Manual Operation',
      'Multi-Document',
      'Off-page Reference',
      'Or',
      'Sort',
      'Summing Function',
    ],
  },
  {
    file: 'arrows.xml',
    include: 'all',
  },
  {
    file: 'basic.xml',
    include: ['Rectangular Callout'],
  },
  {
    file: path.join('electrical', 'logic_gates.xml'),
    include: ['AND', 'OR'],
  },
];

const ATTRIBUTE_RE = /(\w[\w-]*)="([^"]*)"/g;

const parseAttributes = input => {
  const attrs = {};
  for (const match of input.matchAll(ATTRIBUTE_RE)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
};

const parseShapeBlocks = xml =>
  [...xml.matchAll(/<shape\b[^>]*>[\s\S]*?<\/shape>/g)].map(match => {
    const block = match[0];
    const header = block.match(/<shape\b([^>]*)>/);
    const attrs = header ? parseAttributes(header[1]) : {};
    return { block, attrs };
  });

const parseConstraints = block => {
  const constraints = [];
  const connectionsMatch = block.match(/<connections>[\s\S]*?<\/connections>/);
  if (!connectionsMatch) return constraints;
  const connections = connectionsMatch[0];
  for (const match of connections.matchAll(/<constraint\b([^>]*)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    const x = parseFloat(attrs.x ?? '0');
    const y = parseFloat(attrs.y ?? '0');
    if (Number.isFinite(x) && Number.isFinite(y)) {
      constraints.push({
        x,
        y,
        perimeter: attrs.perimeter ?? '0',
        name: attrs.name ?? '',
      });
    }
  }
  return constraints;
};

const parsePathCommands = pathContent => {
  const commands = [];
  const tagRe = /<(move|line|arc|curve|quad|close)\b([^>]*)\/?>(?:\s*)/g;
  for (const match of pathContent.matchAll(tagRe)) {
    const tag = match[1];
    const attrs = parseAttributes(match[2]);
    commands.push({ tag, attrs });
  }
  return commands;
};

const pathFromCommands = (commands, width, height) => {
  const normalized = [];
  for (const command of commands) {
    const { tag, attrs } = command;
    switch (tag) {
      case 'move':
        normalized.push({
          cmd: 'M',
          x: parseFloat(attrs.x) / width,
          y: parseFloat(attrs.y) / height,
        });
        break;
      case 'line':
        normalized.push({
          cmd: 'L',
          x: parseFloat(attrs.x) / width,
          y: parseFloat(attrs.y) / height,
        });
        break;
      case 'curve':
        normalized.push({
          cmd: 'C',
          x1: parseFloat(attrs.x1) / width,
          y1: parseFloat(attrs.y1) / height,
          x2: parseFloat(attrs.x2) / width,
          y2: parseFloat(attrs.y2) / height,
          x: parseFloat(attrs.x) / width,
          y: parseFloat(attrs.y) / height,
        });
        break;
      case 'quad':
        normalized.push({
          cmd: 'Q',
          x1: parseFloat(attrs.x1) / width,
          y1: parseFloat(attrs.y1) / height,
          x: parseFloat(attrs.x) / width,
          y: parseFloat(attrs.y) / height,
        });
        break;
      case 'arc':
        normalized.push({
          cmd: 'A',
          rx: parseFloat(attrs.rx) / width,
          ry: parseFloat(attrs.ry) / height,
          xAxisRotation: parseFloat(attrs['x-axis-rotation'] ?? '0'),
          largeArcFlag: parseInt(attrs['large-arc-flag'] ?? '0', 10),
          sweepFlag: parseInt(attrs['sweep-flag'] ?? '0', 10),
          x: parseFloat(attrs.x) / width,
          y: parseFloat(attrs.y) / height,
        });
        break;
      case 'close':
        normalized.push({ cmd: 'Z' });
        break;
    }
  }
  return normalized;
};

const rectToPath = (attrs, width, height) => {
  const x = parseFloat(attrs.x ?? '0') / width;
  const y = parseFloat(attrs.y ?? '0') / height;
  const w = parseFloat(attrs.w ?? attrs.width ?? '0') / width;
  const h = parseFloat(attrs.h ?? attrs.height ?? '0') / height;
  return [
    { cmd: 'M', x, y },
    { cmd: 'L', x: x + w, y },
    { cmd: 'L', x: x + w, y: y + h },
    { cmd: 'L', x, y: y + h },
    { cmd: 'Z' },
  ];
};

const roundrectToPath = (attrs, width, height) => {
  const x = parseFloat(attrs.x ?? '0');
  const y = parseFloat(attrs.y ?? '0');
  const w = parseFloat(attrs.w ?? attrs.width ?? '0');
  const h = parseFloat(attrs.h ?? attrs.height ?? '0');
  const arcSize = parseFloat(attrs.arcsize ?? '0');
  const r = Math.min(w, h) * (arcSize / 100);
  const rx = r / width;
  const ry = r / height;
  const nx = x / width;
  const ny = y / height;
  const nw = w / width;
  const nh = h / height;
  return [
    { cmd: 'M', x: nx + rx, y: ny },
    { cmd: 'L', x: nx + nw - rx, y: ny },
    {
      cmd: 'A',
      rx,
      ry,
      xAxisRotation: 0,
      largeArcFlag: 0,
      sweepFlag: 1,
      x: nx + nw,
      y: ny + ry,
    },
    { cmd: 'L', x: nx + nw, y: ny + nh - ry },
    {
      cmd: 'A',
      rx,
      ry,
      xAxisRotation: 0,
      largeArcFlag: 0,
      sweepFlag: 1,
      x: nx + nw - rx,
      y: ny + nh,
    },
    { cmd: 'L', x: nx + rx, y: ny + nh },
    {
      cmd: 'A',
      rx,
      ry,
      xAxisRotation: 0,
      largeArcFlag: 0,
      sweepFlag: 1,
      x: nx,
      y: ny + nh - ry,
    },
    { cmd: 'L', x: nx, y: ny + ry },
    {
      cmd: 'A',
      rx,
      ry,
      xAxisRotation: 0,
      largeArcFlag: 0,
      sweepFlag: 1,
      x: nx + rx,
      y: ny,
    },
    { cmd: 'Z' },
  ];
};

const ellipseToPath = (attrs, width, height) => {
  const x = parseFloat(attrs.x ?? '0');
  const y = parseFloat(attrs.y ?? '0');
  const w = parseFloat(attrs.w ?? attrs.width ?? '0');
  const h = parseFloat(attrs.h ?? attrs.height ?? '0');
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  return [
    { cmd: 'M', x: (cx + rx) / width, y: cy / height },
    {
      cmd: 'A',
      rx: rx / width,
      ry: ry / height,
      xAxisRotation: 0,
      largeArcFlag: 1,
      sweepFlag: 0,
      x: (cx - rx) / width,
      y: cy / height,
    },
    {
      cmd: 'A',
      rx: rx / width,
      ry: ry / height,
      xAxisRotation: 0,
      largeArcFlag: 1,
      sweepFlag: 0,
      x: (cx + rx) / width,
      y: cy / height,
    },
    { cmd: 'Z' },
  ];
};

const parsePathsFromSection = (section, width, height) => {
  const paths = [];
  if (!section) return paths;

  const pathBlocks = [...section.matchAll(/<path>([\s\S]*?)<\/path>/g)];
  for (const block of pathBlocks) {
    const commands = parsePathCommands(block[1]);
    if (commands.length) {
      paths.push(pathFromCommands(commands, width, height));
    }
  }

  for (const match of section.matchAll(/<rect\b([^>]*)\/>/g)) {
    paths.push(rectToPath(parseAttributes(match[1]), width, height));
  }

  for (const match of section.matchAll(/<roundrect\b([^>]*)\/>/g)) {
    paths.push(roundrectToPath(parseAttributes(match[1]), width, height));
  }

  for (const match of section.matchAll(/<ellipse\b([^>]*)\/>/g)) {
    paths.push(ellipseToPath(parseAttributes(match[1]), width, height));
  }

  return paths;
};

const parseStencil = (file, include) => {
  const xml = fs.readFileSync(file, 'utf8');
  const shapes = parseShapeBlocks(xml);
  const result = {};

  for (const shape of shapes) {
    const name = shape.attrs.name;
    if (!name) continue;
    if (include !== 'all' && !include.includes(name)) continue;
    const width = parseFloat(shape.attrs.w ?? '100');
    const height = parseFloat(shape.attrs.h ?? '100');

    const backgroundMatch = shape.block.match(
      /<background>([\s\S]*?)<\/background>/
    );
    const foregroundMatch = shape.block.match(
      /<foreground>([\s\S]*?)<\/foreground>/
    );

    const background = backgroundMatch ? backgroundMatch[1] : '';
    const foreground = foregroundMatch ? foregroundMatch[1] : '';

    const backgroundPaths = parsePathsFromSection(background, width, height);
    const foregroundPaths = parsePathsFromSection(foreground, width, height);

    result[name] = {
      width,
      height,
      paths: backgroundPaths,
      strokes: foregroundPaths,
      constraints: parseConstraints(shape.block),
    };
  }

  return result;
};

const merged = {};
for (const source of SOURCES) {
  const filePath = path.join(ROOT, source.file);
  Object.assign(merged, parseStencil(filePath, source.include));
}

const content = `export const drawioStencilShapes = ${JSON.stringify(merged, null, 2)} as const;\n`;
fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, content, 'utf8');
console.log(`Wrote ${Object.keys(merged).length} shapes to ${OUTPUT}`);
