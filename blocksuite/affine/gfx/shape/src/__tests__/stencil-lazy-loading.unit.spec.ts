import { beforeEach, describe, expect, it, vi } from 'vitest';

// Regression coverage for the failure mode described in
// _bmad-output/implementation-artifacts/10-0-library-shape-bundle-size-and-lazy-loading-root-cause-and-design.md
// §4: a prior lazy-load attempt broke shape rendering because nothing ever
// resolved to real data for a legacy (name-only) stencil, and nothing
// triggered a repaint once it did. These tests exercise stencil-utils.ts's
// contract in isolation from the canvas/DOM render pipeline.
//
// The three drawio partition modules are mocked rather than imported for
// real: they're ~28-37MB of generated source each, and this suite needs to
// assert *whether* they were loaded, not exercise their real content.
//
// Note: stencil-utils.ts's module-level resolved-data cache is not reliably
// torn down by vi.resetModules() between tests in this runner (the partition
// loaders below only ever fire once per unique name across the whole file,
// regardless of resetModules calls in between) — so this file uses
// never-repeated fake shape names throughout and keeps the load/dedup story
// in one continuous test rather than asserting fresh state per test.

const { loadPartitionA, loadPartitionBm, loadPartitionNz } = vi.hoisted(
  () => {
    const fakeStencil = (label: string) => ({
      width: 100,
      height: 100,
      paths: [],
      strokes: [],
      constraints: [],
      __label: label,
    });

    return {
      loadPartitionA: vi.fn(() => ({
        drawioLibraryStencilShapesA: {
          'alibaba_cloud/Fake A Shape 1': fakeStencil('a1'),
        },
      })),
      loadPartitionBm: vi.fn(() => ({
        drawioLibraryStencilShapesBM: {
          'basic/Fake BM Shape 1': fakeStencil('bm1'),
        },
      })),
      loadPartitionNz: vi.fn(() => ({
        drawioLibraryStencilShapesNZ: {
          'networks/Fake NZ Shape 1': fakeStencil('nz1'),
        },
      })),
    };
  }
);

vi.mock('../drawio/library-stencils-a.js', loadPartitionA);
vi.mock('../drawio/library-stencils-bm.js', loadPartitionBm);
vi.mock('../drawio/library-stencils-nz.js', loadPartitionNz);

describe('stencil-utils lazy loading', () => {
  beforeEach(() => {
    vi.resetModules();
    loadPartitionA.mockClear();
    loadPartitionBm.mockClear();
    loadPartitionNz.mockClear();
  });

  it('does not load any drawio library partition just from importing stencil-utils', async () => {
    // If this ever regresses back to a static `import` of
    // library-stencils(-a|-bm|-nz).js, that file's ~52MB would be pulled
    // back into whatever bundle imports stencil-utils.ts — including the
    // app's main entry chunk.
    await import('../drawio/stencil-utils.js');

    expect(loadPartitionA).not.toHaveBeenCalled();
    expect(loadPartitionBm).not.toHaveBeenCalled();
    expect(loadPartitionNz).not.toHaveBeenCalled();
  });

  it('resolves a library stencil on demand, backfills the cache, and loads other partitions independently', async () => {
    const { getStencilShapeData, loadStencilShapeData } = await import(
      '../drawio/stencil-utils.js'
    );

    const name = 'alibaba_cloud/Fake A Shape 1';

    // Not loaded yet — must not throw, must not silently return stale/wrong
    // data, and must not block: this is the synchronous fast-path contract
    // every render call site depends on.
    expect(getStencilShapeData(name)).toBeNull();

    const resolved = await loadStencilShapeData(name);
    expect(resolved).toMatchObject({ __label: 'a1' });
    expect(loadPartitionA).toHaveBeenCalledTimes(1);
    expect(loadPartitionBm).not.toHaveBeenCalled();
    expect(loadPartitionNz).not.toHaveBeenCalled();

    // Backfilled into the cache: subsequent lookups hit the fast path with
    // zero further loading, mirroring what the render call sites do after
    // persisting the result onto stencilData.
    expect(getStencilShapeData(name)).toBe(resolved);
    await loadStencilShapeData(name);
    expect(loadPartitionA).toHaveBeenCalledTimes(1);

    // A stencil from a different partition loads that partition, and only
    // that one — partition 'a' being loaded doesn't pull in 'nz'.
    const nzName = 'networks/Fake NZ Shape 1';
    expect(getStencilShapeData(nzName)).toBeNull();
    const nzResolved = await loadStencilShapeData(nzName);
    expect(nzResolved).toMatchObject({ __label: 'nz1' });
    expect(loadPartitionNz).toHaveBeenCalledTimes(1);
    expect(loadPartitionBm).not.toHaveBeenCalled();

    // Concurrent lookups for the same not-yet-loaded partition must
    // deduplicate to a single load, not one per call.
    await Promise.all([
      loadStencilShapeData('basic/Fake BM Shape 1'),
      loadStencilShapeData('basic/Fake BM Shape 1'),
    ]);
    expect(loadPartitionBm).toHaveBeenCalledTimes(1);
  });

  it('returns built-in stencils synchronously with no partition loaded', async () => {
    const { getStencilShapeData, STENCIL_SHAPE_NAMES } = await import(
      '../drawio/stencil-utils.js'
    );

    expect(STENCIL_SHAPE_NAMES.length).toBeGreaterThan(0);
    const builtinName = STENCIL_SHAPE_NAMES[0];
    expect(getStencilShapeData(builtinName)).not.toBeNull();
    expect(loadPartitionA).not.toHaveBeenCalled();
    expect(loadPartitionBm).not.toHaveBeenCalled();
    expect(loadPartitionNz).not.toHaveBeenCalled();
  });

  it('resolves to null for an unknown stencil name without throwing or loading anything', async () => {
    const { loadStencilShapeData } = await import('../drawio/stencil-utils.js');
    await expect(
      loadStencilShapeData('not-a-real-category/not-a-real-shape')
    ).resolves.toBeNull();
    expect(loadPartitionA).not.toHaveBeenCalled();
    expect(loadPartitionBm).not.toHaveBeenCalled();
    expect(loadPartitionNz).not.toHaveBeenCalled();
  });
});
