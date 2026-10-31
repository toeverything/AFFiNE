import { drawioStencilShapes } from './stencils.js';

export type StencilCommand =
  | { cmd: 'M'; x: number; y: number }
  | { cmd: 'L'; x: number; y: number }
  | {
      cmd: 'C';
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      x: number;
      y: number;
    }
  | { cmd: 'Q'; x1: number; y1: number; x: number; y: number }
  | {
      cmd: 'A';
      rx: number;
      ry: number;
      xAxisRotation: number;
      largeArcFlag: number;
      sweepFlag: number;
      x: number;
      y: number;
    }
  | { cmd: 'Z' };

export type StencilShapeData = {
  width: number;
  height: number;
  paths: ReadonlyArray<ReadonlyArray<StencilCommand>>;
  strokes: ReadonlyArray<ReadonlyArray<StencilCommand>>;
  constraints: ReadonlyArray<{
    x: number;
    y: number;
    perimeter: string;
    name: string;
  }>;
};

const builtinStencilShapes = drawioStencilShapes as unknown as Record<
  string,
  StencilShapeData
>;

// Only the small built-in set (~114KB) is eager. The drawio library
// (~52MB minified across the three partitions below) must never be a
// static/synchronous dependency of anything on the app's boot path — see
// _bmad-output/implementation-artifacts/10-0-library-shape-bundle-size-and-lazy-loading-root-cause-and-design.md
// for why. Do not add a static `import` of library-stencils(-a|-bm|-nz).js
// here or anywhere reachable from app startup.
export const STENCIL_SHAPE_NAMES = Object.keys(builtinStencilShapes).sort();

/**
 * Partitioning mirrors the on-disk split of the generated library files.
 * Verified empirically (2026-08-16): no drawio category straddles two
 * partitions, so this map can key on category alone.
 */
type LibraryPartition = 'a' | 'bm' | 'nz';

const CATEGORY_TO_PARTITION: Record<string, LibraryPartition> = {
  alibaba_cloud: 'a',
  android: 'a',
  arrows: 'a',
  atlassian: 'a',
  aws: 'a',
  aws2: 'a',
  aws3: 'a',
  aws3d: 'a',
  aws4: 'a',
  azure: 'a',
  basic: 'bm',
  bootstrap: 'bm',
  bpmn: 'bm',
  cabinets: 'bm',
  cisco: 'bm',
  cisco19: 'bm',
  cisco_safe: 'bm',
  citrix: 'bm',
  citrix2: 'bm',
  eip: 'bm',
  electrical: 'bm',
  floorplan: 'bm',
  flowchart: 'bm',
  fluid_power: 'bm',
  gcp: 'bm',
  gcp2: 'bm',
  gmdl: 'bm',
  ibm: 'bm',
  ibm_cloud: 'bm',
  ios7: 'bm',
  kubernetes: 'bm',
  kubernetes2: 'bm',
  lean_mapping: 'bm',
  mockup: 'bm',
  mscae: 'bm',
  networks: 'nz',
  networks2: 'nz',
  office: 'nz',
  openstack: 'nz',
  pid: 'nz',
  rack: 'nz',
  salesforce: 'nz',
  signs: 'nz',
  sitemap: 'nz',
  veeam: 'nz',
  vvd: 'nz',
  webicons: 'nz',
  weblogos: 'nz',
};

const partitionLoaders: Record<
  LibraryPartition,
  () => Promise<Record<string, StencilShapeData>>
> = {
  a: () =>
    import(
      /* webpackChunkName: "library-stencils-a" */ './library-stencils-a.js'
    ).then(
      m => m.drawioLibraryStencilShapesA as unknown as Record<string, StencilShapeData>
    ),
  bm: () =>
    import(
      /* webpackChunkName: "library-stencils-bm" */ './library-stencils-bm.js'
    ).then(
      m => m.drawioLibraryStencilShapesBM as unknown as Record<string, StencilShapeData>
    ),
  nz: () =>
    import(
      /* webpackChunkName: "library-stencils-nz" */ './library-stencils-nz.js'
    ).then(
      m => m.drawioLibraryStencilShapesNZ as unknown as Record<string, StencilShapeData>
    ),
};

const resolvedLibraryCache = new Map<string, StencilShapeData>();
const pendingPartitionLoads = new Map<LibraryPartition, Promise<void>>();

function loadPartition(partition: LibraryPartition): Promise<void> {
  let pending = pendingPartitionLoads.get(partition);
  if (!pending) {
    pending = partitionLoaders[partition]().then(shapes => {
      for (const key of Object.keys(shapes)) {
        resolvedLibraryCache.set(key, shapes[key]);
      }
    });
    pendingPartitionLoads.set(partition, pending);
  }
  return pending;
}

/**
 * Synchronous, cache-only lookup. Returns null for a drawio-library stencil
 * that hasn't been loaded yet — callers on the render path must handle a
 * null result (fall back to a placeholder) and use `loadStencilShapeData`
 * to actually trigger loading. Never blocks, never triggers a network/import.
 */
export const getStencilShapeData = (name: string): StencilShapeData | null =>
  builtinStencilShapes[name] ?? resolvedLibraryCache.get(name) ?? null;

/**
 * Resolves a stencil's data, loading the owning partition on demand if
 * needed. Safe to call repeatedly for the same name/partition — loads are
 * deduplicated. Resolves to null if the name isn't a known built-in or
 * library stencil.
 */
export function loadStencilShapeData(
  name: string
): Promise<StencilShapeData | null> {
  const builtin = builtinStencilShapes[name];
  if (builtin) {
    return Promise.resolve(builtin);
  }
  if (resolvedLibraryCache.has(name)) {
    return Promise.resolve(resolvedLibraryCache.get(name) ?? null);
  }
  const category = name.split('/')[0];
  const partition = CATEGORY_TO_PARTITION[category];
  if (!partition) {
    return Promise.resolve(null);
  }
  return loadPartition(partition).then(
    () => resolvedLibraryCache.get(name) ?? null
  );
}

/** Loads every library partition. Intended for the shape-browser panel, which needs to render thumbnails across all categories at once. */
export function loadAllLibraryStencilPartitions(): Promise<void> {
  return Promise.all(
    (Object.keys(partitionLoaders) as LibraryPartition[]).map(loadPartition)
  ).then(() => undefined);
}

const scale = (value: number, total: number) => value * total;

export const buildPathFromStencil = (
  commands: ReadonlyArray<StencilCommand>,
  width: number,
  height: number
) => {
  const parts: string[] = [];
  for (const command of commands) {
    switch (command.cmd) {
      case 'M':
        parts.push(`M ${scale(command.x, width)} ${scale(command.y, height)}`);
        break;
      case 'L':
        parts.push(`L ${scale(command.x, width)} ${scale(command.y, height)}`);
        break;
      case 'C':
        parts.push(
          `C ${scale(command.x1, width)} ${scale(command.y1, height)} ${scale(command.x2, width)} ${scale(command.y2, height)} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'Q':
        parts.push(
          `Q ${scale(command.x1, width)} ${scale(command.y1, height)} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'A':
        parts.push(
          `A ${scale(command.rx, width)} ${scale(command.ry, height)} ${command.xAxisRotation} ${command.largeArcFlag} ${command.sweepFlag} ${scale(command.x, width)} ${scale(command.y, height)}`
        );
        break;
      case 'Z':
        parts.push('Z');
        break;
    }
  }
  return parts.join(' ');
};
