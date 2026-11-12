import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_DRAWIO_PATHS = [path.resolve('drawio'), '/workspace/drawio'];

const OUTPUT_DIR = path.resolve(
  'blocksuite/affine/gfx/shape/src/drawio/libraries'
);
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');

const argv = process.argv.slice(2);
const command = argv[0];

const args = new Map();
const libraryArgs = [];
for (let i = 1; i < argv.length; i += 1) {
  const key = argv[i];
  if (!key.startsWith('--')) continue;
  const value =
    argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
  args.set(key.slice(2), value);
  if (key === '--library' && value !== 'true') {
    libraryArgs.push(value);
  }
  if (value !== 'true') i += 1;
}

const getArg = (name, fallback) => args.get(name) ?? fallback;
const hasArg = name => args.has(name);

const resolveDrawioRoot = async () => {
  const candidate = getArg('drawio');
  if (candidate) return path.resolve(candidate);
  for (const entry of DEFAULT_DRAWIO_PATHS) {
    try {
      const stat = await fs.stat(entry);
      if (stat.isDirectory()) return entry;
    } catch {
      // ignore
    }
  }
  throw new Error('Drawio directory not found. Pass --drawio /path/to/drawio');
};

const toLabel = id => {
  const parts = id.split('/');
  const labelParts = parts.map(part =>
    part
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .split(' ')
      .filter(Boolean)
      .map(word => {
        if (word.length <= 2) return word.toUpperCase();
        if (/^[a-z]{2,}$/i.test(word) && word === word.toLowerCase()) {
          return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return word;
      })
      .join(' ')
  );
  return labelParts.join(' / ');
};

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
          x: parseFloat(attrs.x ?? attrs.x3) / width,
          y: parseFloat(attrs.y ?? attrs.y3) / height,
        });
        break;
      case 'quad':
        normalized.push({
          cmd: 'Q',
          x1: parseFloat(attrs.x1) / width,
          y1: parseFloat(attrs.y1) / height,
          x: parseFloat(attrs.x ?? attrs.x2) / width,
          y: parseFloat(attrs.y ?? attrs.y2) / height,
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

const parseStencilXml = xml => {
  const shapes = parseShapeBlocks(xml);
  return shapes
    .map(shape => {
      const name = shape.attrs.name;
      if (!name) return null;
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
      return {
        name,
        width,
        height,
        paths: parsePathsFromSection(background, width, height),
        strokes: parsePathsFromSection(foreground, width, height),
        constraints: parseConstraints(shape.block),
      };
    })
    .filter(Boolean);
};

const collectStencilLibraries = async drawioRoot => {
  const stencilsRoot = path.join(drawioRoot, 'src/main/webapp/stencils');
  const entries = [];

  const walk = async (dir, prefix = '') => {
    const items = await fs.readdir(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      const relative = path.join(prefix, item.name);
      if (item.isDirectory()) {
        await walk(fullPath, relative);
        continue;
      }
      if (!item.name.endsWith('.xml')) continue;
      const id = relative.replace(/\.xml$/, '').replace(/\\/g, '/');
      entries.push({
        id,
        label: toLabel(id),
        source: path.join('src/main/webapp/stencils', relative),
      });
    }
  };

  await walk(stencilsRoot);
  return entries.sort((a, b) => a.id.localeCompare(b.id));
};

const printList = libraries => {
  const maxId = Math.max(...libraries.map(item => item.id.length), 10);
  const maxLabel = Math.max(...libraries.map(item => item.label.length), 10);
  console.log(`${'ID'.padEnd(maxId)}  ${'Label'.padEnd(maxLabel)}  Source`);
  console.log(`${'-'.repeat(maxId)}  ${'-'.repeat(maxLabel)}  ------`);
  libraries.forEach(item => {
    console.log(
      `${item.id.padEnd(maxId)}  ${item.label.padEnd(maxLabel)}  ${item.source}`
    );
  });
};

const readManifest = async () => {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
};

const writeManifest = async entries => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(entries, null, 2));
};

const installLibraries = async (drawioRoot, libraries) => {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const manifest = await readManifest();
  const manifestById = new Map(manifest.map(item => [item.id, item]));

  for (const lib of libraries) {
    const sourcePath = path.join(drawioRoot, lib.source);
    const destPath = path.join(OUTPUT_DIR, `${lib.id}.xml`);
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(sourcePath, destPath);

    manifestById.set(lib.id, {
      id: lib.id,
      label: lib.label,
      source: lib.source,
      dest: path.relative(process.cwd(), destPath).replace(/\\/g, '/'),
    });
  }

  await writeManifest(
    [...manifestById.values()].sort((a, b) => a.id.localeCompare(b.id))
  );
};

const LIBRARY_STENCILS_PATH = path.resolve(
  'blocksuite/affine/gfx/shape/src/drawio/library-stencils.ts'
);
const LIBRARY_CATALOG_PATH = path.resolve(
  'blocksuite/affine/gfx/shape/src/drawio/library-catalog.ts'
);

const buildLibraryOutputs = async () => {
  const manifest = await readManifest();
  const stencilShapes = {};
  const catalog = [];

  for (const entry of manifest) {
    const destPath = path.resolve(entry.dest);
    const xml = await fs.readFile(destPath, 'utf8');
    const shapes = parseStencilXml(xml);

    shapes.forEach(shape => {
      const shapeId = `${entry.id}/${shape.name}`;
      const label = toLabel(shape.name);
      stencilShapes[shapeId] = {
        width: shape.width,
        height: shape.height,
        paths: shape.paths,
        strokes: shape.strokes,
        constraints: shape.constraints,
      };
      const categoryLabel = entry.label ?? toLabel(entry.id);
      catalog.push({
        id: shapeId,
        label,
        categoryId: `lib:${entry.id}`,
        categoryLabel,
        stencilName: shapeId,
      });
    });
  }

  catalog.sort((a, b) => {
    const categoryCompare = a.categoryLabel.localeCompare(b.categoryLabel);
    if (categoryCompare !== 0) return categoryCompare;
    return a.label.localeCompare(b.label);
  });

  const stencilsContent =
    `import type { StencilShapeData } from './stencil-utils.js';\n\n` +
    `export const drawioLibraryStencilShapes: Record<string, StencilShapeData> = ` +
    `${JSON.stringify(stencilShapes, null, 2)};\n`;
  await fs.writeFile(LIBRARY_STENCILS_PATH, stencilsContent, 'utf8');

  const catalogContent =
    `export type DrawioLibraryShape = {\n` +
    `  id: string;\n` +
    `  label: string;\n` +
    `  categoryId: string;\n` +
    `  categoryLabel: string;\n` +
    `  stencilName: string;\n` +
    `};\n\n` +
    `export const drawioLibraryCatalog: DrawioLibraryShape[] = ` +
    `${JSON.stringify(catalog, null, 2)};\n`;
  await fs.writeFile(LIBRARY_CATALOG_PATH, catalogContent, 'utf8');
};

const filterLibraries = (libraries, { ids, filter, all }) => {
  if (all) return libraries;
  if (ids.length > 0) {
    const set = new Set(ids);
    return libraries.filter(lib => set.has(lib.id));
  }
  if (filter) {
    const re = new RegExp(filter, 'i');
    return libraries.filter(lib => re.test(lib.id) || re.test(lib.label));
  }
  return [];
};

const run = async () => {
  if (!command || ['list', 'install', 'help'].includes(command) === false) {
    console.log(
      'Usage:\n' +
        '  node scripts/drawio-library-manager.mjs list [--drawio /path]\n' +
        '  node scripts/drawio-library-manager.mjs install --library <id> [--library <id>...] [--drawio /path]\n' +
        '  node scripts/drawio-library-manager.mjs install --filter <regex> [--drawio /path]\n' +
        '  node scripts/drawio-library-manager.mjs install --all [--drawio /path]\n'
    );
    process.exit(1);
  }

  if (command === 'help') {
    console.log(
      'Drawio library manager\n\n' +
        'Commands:\n' +
        '  list       List available draw.io stencil libraries\n' +
        '  install    Copy selected libraries into AFFiNE and update manifest\n' +
        '             (also regenerates library catalog + stencils)\n\n' +
        'Options:\n' +
        '  --drawio   Path to draw.io repo (default: ./drawio or /workspace/drawio)\n' +
        '  --library  Library id (can be repeated)\n' +
        '  --filter   Regex to match id/label\n' +
        '  --all      Install all libraries\n'
    );
    return;
  }

  const drawioRoot = await resolveDrawioRoot();
  const libraries = await collectStencilLibraries(drawioRoot);

  if (command === 'list') {
    printList(libraries);
    return;
  }

  if (command === 'install') {
    const ids = libraryArgs;
    const selected = filterLibraries(libraries, {
      ids,
      filter: getArg('filter'),
      all: hasArg('all'),
    });

    if (selected.length === 0) {
      console.log('No libraries selected. Use --library, --filter, or --all.');
      process.exit(1);
    }

    await installLibraries(drawioRoot, selected);
    await buildLibraryOutputs();
    console.log(`Installed ${selected.length} libraries to ${OUTPUT_DIR}`);
  }
};

run().catch(error => {
  console.error(error.message || error);
  process.exit(1);
});
