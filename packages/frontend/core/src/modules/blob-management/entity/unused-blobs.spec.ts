/** @vitest-environment happy-dom */

import type { PeerWorkspaceState } from '@affine/nbstore';
import { Framework } from '@toeverything/infra';
import { BehaviorSubject } from 'rxjs';
import { expect, test, vi } from 'vitest';
import {
  Array as YArray,
  Doc as YDoc,
  encodeStateAsUpdate,
  encodeStateVector,
  Map as YMap,
  mergeUpdates,
  Text as YText,
} from 'yjs';

import { WorkspaceService } from '../../workspace';
import { WorkspaceFlavoursService } from '../../workspace/services/flavours';
import { UnusedBlobs } from './unused-blobs';

test.each([
  'local',
  'cloud',
  'legacy-cloud',
  'legacy-clock-change',
  'absent-root',
  'pending',
  'pending-delete',
  'malformed',
  'rootless',
  'missing-child',
  'parent-cycle',
  'root-pending',
  'root-clock-change',
  'inventory-clock-source',
  'missing-inventory-clock-source',
  'missing',
  'clock-change',
  'inventory-change',
  'inventory-unready',
] as const)(
  'unused blob detection requires complete body coverage: %s',
  async mode => {
    const pending = new YDoc();
    pending.getMap('test').set('prefix', 1);
    const state = encodeStateVector(pending);
    if (mode === 'root-pending')
      pending.getMap('meta').set('avatar', 'hidden-avatar');
    else if (mode === 'pending-delete') pending.getMap('test').delete('prefix');
    else pending.getMap('test').set('tail', 2);
    const partial = encodeStateAsUpdate(pending, state);
    const sources = new Map<string, Uint8Array>([
      ['empty', new Uint8Array([0, 0])],
    ]);
    for (const id of ['workspace', 'db$properties', 'userdata$user$settings']) {
      if (mode === 'absent-root' && id === 'workspace') continue;
      const doc = new YDoc({ guid: id });
      doc.getMap('meta').set('avatar', `avatar-${id}`);
      doc.getMap('blocks').set(
        'image',
        new YMap<unknown>([
          ['sys:flavour', 'affine:image'],
          ['prop:sourceId', `used-${id}`],
        ])
      );
      sources.set(
        id,
        mode === 'root-pending' && id === 'workspace'
          ? mergeUpdates([encodeStateAsUpdate(doc), partial])
          : encodeStateAsUpdate(doc)
      );
      doc.destroy();
    }
    for (const id of ['doc1', 'doc2']) {
      const doc = new YDoc({ guid: id });
      const blocks = doc.getMap('blocks');
      if (mode !== 'rootless' || id !== 'doc1') {
        blocks.set(
          'page',
          new YMap<unknown>([
            ['sys:id', 'page'],
            ['sys:flavour', 'affine:page'],
            ['prop:title', new YText('Document')],
            [
              'sys:children',
              YArray.from(
                mode === 'missing-child' ? ['missing', 'image'] : ['image']
              ),
            ],
          ])
        );
      }
      blocks.set(
        'image',
        new YMap<unknown>([
          ['sys:id', 'image'],
          ['sys:flavour', 'affine:image'],
          ['prop:sourceId', `used-${id}`],
          [
            'sys:children',
            YArray.from(mode === 'parent-cycle' ? ['page'] : []),
          ],
        ])
      );
      let bin = encodeStateAsUpdate(doc);
      if (id === 'doc1') {
        if (mode === 'pending' || mode === 'pending-delete') {
          bin = mergeUpdates([bin, partial]);
        }
        if (mode === 'malformed') bin = new Uint8Array([255]);
      }
      sources.set(id, bin);
      doc.destroy();
    }
    pending.destroy();
    const clocks = Object.fromEntries(
      [...sources.keys()].map(id => [id, new Date(1000)])
    );
    if (
      mode === 'inventory-clock-source' ||
      mode === 'missing-inventory-clock-source'
    ) {
      delete clocks['userdata$user$settings'];
    }
    const inventory = new BehaviorSubject<PeerWorkspaceState>({
      ready: mode !== 'inventory-unready',
      cacheToken: 1,
      clocks: {
        doc1: 1000,
        doc2: 1000,
        empty: 1000,
        userdata$user$settings: 1000,
      },
      docs: ['doc1', 'doc2', 'empty'].map(docId => ({
        docId,
        timestamp: 1000,
        lifecycle: docId === 'doc2' ? 'trashed' : null,
        lifecycleChangedAt: null,
      })),
    });
    const storage = {
      getDocTimestamps: vi
        .fn()
        .mockResolvedValueOnce(clocks)
        .mockResolvedValue(
          mode === 'clock-change' || mode === 'legacy-clock-change'
            ? { ...clocks, doc1: new Date(2000) }
            : mode === 'root-clock-change'
              ? { ...clocks, workspace: new Date(2000) }
              : clocks
        ),
      getDoc: vi.fn(async (docId: string) => {
        if (mode === 'missing' && docId === 'doc1') return null;
        if (
          mode === 'missing-inventory-clock-source' &&
          docId === 'userdata$user$settings'
        )
          return null;
        if (mode === 'inventory-change' && docId === 'doc2') {
          inventory.next({ ...inventory.value, ready: false, docs: [] });
        }
        return { docId, bin: sources.get(docId), timestamp: clocks[docId] };
      }),
    };
    const flavour = mode === 'local' ? 'local' : 'affine-cloud';
    const listManageableBlobs = vi
      .fn()
      .mockResolvedValue(
        [
          'used-doc1',
          'used-doc2',
          'unused',
          ...(mode === 'root-pending' ? ['hidden-avatar'] : []),
          ...['workspace', 'db$properties', 'userdata$user$settings'].flatMap(
            id =>
              mode === 'absent-root' && id === 'workspace'
                ? []
                : [`used-${id}`, `avatar-${id}`]
          ),
        ].map(key => ({ key }))
      );
    const framework = new Framework();
    framework
      .service(WorkspaceFlavoursService, {
        flavours$: { value: [{ flavour, listManageableBlobs }] },
      } as unknown as WorkspaceFlavoursService)
      .service(WorkspaceService, {
        workspace: {
          id: 'workspace',
          flavour,
          engine: {
            usesWorkspaceState:
              mode !== 'local' &&
              mode !== 'legacy-cloud' &&
              mode !== 'legacy-clock-change',
            doc: {
              waitForSynced: vi.fn(),
              workspaceState$:
                mode === 'legacy-cloud' || mode === 'legacy-clock-change'
                  ? new BehaviorSubject(null)
                  : inventory,
              storage,
            },
          },
        },
      } as unknown as WorkspaceService)
      .entity(UnusedBlobs, [WorkspaceFlavoursService, WorkspaceService]);
    const entity = framework.provider().createEntity(UnusedBlobs);
    if (
      mode === 'local' ||
      mode === 'cloud' ||
      mode === 'legacy-cloud' ||
      mode === 'absent-root' ||
      mode === 'rootless' ||
      mode === 'missing-child' ||
      mode === 'parent-cycle' ||
      mode === 'inventory-clock-source'
    ) {
      await expect(entity.getUnusedBlobs()).resolves.toEqual([
        { key: 'unused' },
      ]);
      expect(storage.getDoc.mock.calls.map(([id]) => id).sort()).toEqual([
        'db$properties',
        'doc1',
        'doc2',
        'empty',
        'userdata$user$settings',
        ...(mode === 'absent-root' ? [] : ['workspace']),
      ]);
      if (mode === 'cloud') {
        const expected = await entity.getUnusedBlobs();
        const scan = vi.spyOn(entity, 'getUnusedBlobs');
        scan.mockRejectedValueOnce(new Error('Document sources changed'));
        entity.unusedBlobs$.setValue(expected);
        entity.revalidate();
        expect(entity.isLoading$.value).toBe(true);
        expect(entity.unusedBlobs$.value).toEqual([]);
        await vi.waitFor(() => expect(entity.isLoading$.value).toBe(false));
        expect(entity.unusedBlobs$.value).toEqual([]);
        expect(scan).toHaveBeenCalledTimes(1);

        entity.revalidate();
        await vi.waitFor(() =>
          expect(entity.unusedBlobs$.value).toEqual(expected)
        );
        expect(entity.isLoading$.value).toBe(false);

        const pending =
          Promise.withResolvers<
            Awaited<ReturnType<typeof entity.getUnusedBlobs>>
          >();
        let cancelled: AbortSignal | undefined;
        scan.mockImplementationOnce(signal => {
          cancelled = signal;
          return pending.promise;
        });
        entity.revalidate();
        entity.revalidate();
        expect(cancelled?.aborted).toBe(true);
        expect(entity.isLoading$.value).toBe(true);
        await vi.waitFor(() =>
          expect(entity.unusedBlobs$.value).toEqual(expected)
        );
        pending.resolve([]);
        await pending.promise;
        expect(entity.unusedBlobs$.value).toEqual(expected);
        expect(entity.isLoading$.value).toBe(false);
        entity.revalidate.unsubscribe();
      }
    } else {
      await expect(entity.getUnusedBlobs()).rejects.toThrow();
    }
  }
);
