import { GuardService } from '@affine/core/modules/permissions/services/guard';
import { GuardStore } from '@affine/core/modules/permissions/stores/guard';
import { UserFriendlyError } from '@affine/error';
import { Framework, LiveData } from '@toeverything/infra';
import { Observable, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { MobileShellDataProjection } from './shell-data-projection';

describe('MobileShellDataProjection', () => {
  it.each([
    { name: 'editable', read: true, update: true },
    { name: 'read-only', read: true, update: false },
    { name: 'denied', read: false, update: false },
  ])(
    'loads $name permissions once and keeps stable entries and batched refs',
    async permission => {
      const metaA$ = new LiveData({ title: 'A' });
      const metaB$ = new LiveData({ title: 'B' });
      const docsMap$ = new LiveData(
        new Map([
          ['a', { meta$: metaA$ }],
          ['b', { meta$: metaB$ }],
        ])
      );
      const favorites$ = new LiveData<{ type: 'doc' | 'folder'; id: string }[]>(
        []
      );
      const activeDoc$ = new LiveData<string | null>(null);
      const nonTrashIds$ = new LiveData(['a', 'b']);
      const docById$ = vi.fn((id: string) =>
        docsMap$.selector(docs => docs.get(id))
      );
      const permissionA$ = new LiveData<boolean | undefined>(undefined);
      const updatePermissionA$ = new LiveData<boolean | undefined>(undefined);
      const can$ = vi.fn((action: string, id: string) =>
        id === 'a'
          ? action === 'Doc_Read'
            ? permissionA$
            : updatePermissionA$
          : new LiveData<boolean | undefined>(true)
      );
      const revalidateCan = vi.fn((_action: string, id: string) => {
        if (id === 'a') {
          queueMicrotask(() => {
            permissionA$.next(permission.read);
            updatePermissionA$.next(permission.update);
          });
        }
      });
      const releaseDoc = vi.fn();
      const releaseIndexer = vi.fn();
      const refsSubscriptions = vi.fn();
      const refs$ = new Subject<
        Map<string, { docId: string; title: string }[]>
      >();
      const missingFolder$ = new LiveData(undefined);
      const collectionId = 'empty-collection';
      const tagId = 'empty-tag';
      const collectionDocs$ = new LiveData<string[]>([]);
      const collection$ = new LiveData<
        { watch: () => Observable<string[]> } | undefined
      >(undefined);
      const tag = { id: tagId, pageIds$: new LiveData<string[]>([]) };
      const watchRefsFrom = vi.fn(
        () =>
          new Observable(subscriber => {
            refsSubscriptions();
            return refs$.subscribe(subscriber);
          })
      );
      const args = [
        {
          list: {
            docsMap$,
            nonTrashDocsIds$: nonTrashIds$,
            doc$: docById$,
          },
        },
        {
          watchRefsFrom,
          watchRefsBySourceFrom: watchRefsFrom,
          indexer: {
            addPriority: vi.fn(() => releaseIndexer),
            waitForDocCompleted: vi.fn(() => Promise.resolve()),
          },
        },
        { favoriteList: { sortedList$: favorites$ } },
        {
          globalContext: {
            docId: { $: activeDoc$ },
            collectionId: { $: new LiveData(null) },
            tagId: { $: new LiveData(null) },
          },
        },
        { can$, revalidateCan },
        {
          workspace: {
            engine: { doc: { addPriority: vi.fn(() => releaseDoc) } },
          },
        },
        {
          collectionMetas$: new LiveData([
            { id: collectionId, name: 'Empty Collection' },
          ]),
          collection$: vi.fn(() => collection$),
        },
        {
          folderTree: {
            rootFolder: { sortedChildren$: new LiveData([]) },
            folderNode$: vi.fn(() => missingFolder$),
          },
        },
        {
          tagList: {
            tags$: new LiveData([tag]),
            tagMetas$: new LiveData([
              { id: tagId, name: 'Empty Tag', color: '#000' },
            ]),
            tagByTagId$: vi.fn(() => new LiveData(tag)),
          },
        },
      ] as unknown as ConstructorParameters<typeof MobileShellDataProjection>;
      const framework = new Framework();
      framework.service(
        MobileShellDataProjection,
        () => new MobileShellDataProjection(...args)
      );
      const projection = framework.provider().get(MobileShellDataProjection);
      const entryA$ = projection.entry$('a');
      const entryB$ = projection.entry$('b');
      expect(revalidateCan).not.toHaveBeenCalled();
      const entryASubscription = entryA$.subscribe();
      expect(revalidateCan).toHaveBeenCalledExactlyOnceWith('Doc_Read', 'a');
      expect(entryA$.value).toMatchObject({
        canRead: undefined,
        canUpdate: undefined,
      });
      const entryBSubscription = entryB$.subscribe();
      await Promise.resolve();
      expect(entryA$.value).toMatchObject({
        canRead: permission.read,
        canUpdate: permission.update,
      });
      const navigationEntryA$ = projection.navigationEntry$('doc', 'a');
      const navigationEntryASubscription = navigationEntryA$.subscribe();
      const navigationEntriesSubscription =
        projection.navigationEntries$.subscribe();
      const firstNavigationEntryA = navigationEntryA$.value;
      const sectionsChanged = vi.fn();
      const sectionsSubscription =
        projection.navigationSections$.subscribe(sectionsChanged);
      expect(
        projection.navigationSections$.value.map(section =>
          section.children.at(-1)
        )
      ).toEqual([
        { kind: 'action', entityId: 'favorites', action: 'section' },
        { kind: 'action', entityId: 'organize', action: 'section' },
        { kind: 'action', entityId: 'collections', action: 'section' },
        { kind: 'action', entityId: 'tags', action: 'section' },
      ]);
      expect(projection.navigationSections$.value[2].children[0]).toMatchObject(
        {
          kind: 'collection',
          entityId: collectionId,
          expandable: true,
          children: [
            {
              kind: 'action',
              entityId: collectionId,
              action: 'collection-new-doc',
            },
          ],
        }
      );
      expect(projection.navigationSections$.value[3].children[0]).toMatchObject(
        {
          kind: 'tag',
          entityId: tagId,
          expandable: true,
          children: [
            { kind: 'action', entityId: tagId, action: 'tag-new-doc' },
          ],
        }
      );
      collection$.next({ watch: () => collectionDocs$ });
      collectionDocs$.next(['a']);
      expect(
        projection.navigationSections$.value[2].children[0].children?.[0]
      ).toMatchObject({ kind: 'doc', entityId: 'a' });
      navigationEntryASubscription.unsubscribe();
      const resumedNavigationEntryASubscription = navigationEntryA$.subscribe();
      expect(navigationEntryA$.value).toBe(firstNavigationEntryA);
      sectionsChanged.mockClear();
      const firstA = entryA$.value;
      const entryAChanged = vi.fn();
      const entryAChangeSubscription = entryA$.subscribe(entryAChanged);

      metaB$.next({ title: 'B2' });
      expect(entryA$.value).toBe(firstA);
      expect(entryB$.value?.title).toBe('B2');
      expect(sectionsChanged).not.toHaveBeenCalled();
      favorites$.next([{ type: 'folder', id: 'missing' }]);
      expect(projection.navigationSections$.value[0].children).toEqual([
        { kind: 'action', entityId: 'favorites', action: 'section' },
      ]);
      favorites$.next([{ type: 'doc', id: 'b' }]);
      activeDoc$.next('b');
      expect(entryAChanged).toHaveBeenCalledOnce();
      expect(revalidateCan.mock.calls.filter(([, id]) => id === 'a')).toEqual([
        ['Doc_Read', 'a'],
      ]);
      expect(can$.mock.calls.filter(([, id]) => id === 'a')).toEqual([
        ['Doc_Read', 'a'],
        ['Doc_Update', 'a'],
      ]);

      const refsSubscription = projection.refsByDoc$.subscribe();
      favorites$.next([{ type: 'doc', id: 'a' }]);
      projection.setExpandedVisibleDocIds(['a']);
      await Promise.resolve();
      await Promise.resolve();
      refs$.next(new Map([['a', [{ docId: 'b', title: 'B' }]]]));
      expect(
        projection.navigationSections$.value[0].children[0].children
      ).toHaveLength(permission.read ? 2 : 1);
      expect(
        projection.navigationSections$.value[0].children[0].children?.at(-1)
      ).toMatchObject({ kind: 'action', action: 'doc-new-linked' });
      permissionA$.next(false);
      expect(
        projection.navigationSections$.value[0].children[0].children ?? []
      ).toHaveLength(1);
      releaseDoc.mockClear();
      releaseIndexer.mockClear();
      watchRefsFrom.mockClear();
      refsSubscriptions.mockClear();
      projection.setExpandedVisibleDocIds(
        Array.from({ length: 600 }, (_, index) => `doc-${index}`)
      );
      await Promise.resolve();
      await Promise.resolve();
      expect(watchRefsFrom).toHaveBeenCalledTimes(1);
      const [[requestedIds]] = watchRefsFrom.mock.calls as unknown as [
        [string[]],
      ];
      expect(requestedIds).toHaveLength(600);
      expect(refsSubscriptions).toHaveBeenCalledTimes(1);

      projection.visible$.next(false);
      expect(releaseDoc).toHaveBeenCalledTimes(600);
      expect(releaseIndexer).toHaveBeenCalledTimes(600);
      docById$.mockClear();
      can$.mockClear();
      revalidateCan.mockClear();
      const largeIds = Array.from({ length: 600 }, (_, index) => `f-${index}`);
      nonTrashIds$.next(largeIds);
      favorites$.next(largeIds.map(id => ({ type: 'doc', id })));
      expect(projection.navigationSections$.value[0].children).toHaveLength(
        601
      );
      expect(docById$).not.toHaveBeenCalled();
      expect(can$).not.toHaveBeenCalled();
      expect(revalidateCan).not.toHaveBeenCalled();
      refsSubscription.unsubscribe();
      entryASubscription.unsubscribe();
      entryAChangeSubscription.unsubscribe();
      entryBSubscription.unsubscribe();
      resumedNavigationEntryASubscription.unsubscribe();
      navigationEntriesSubscription.unsubscribe();
      sectionsSubscription.unsubscribe();
    }
  );

  it.each([true, false])(
    'uses real guard permissions and releases hidden priorities (owner: %s)',
    async owner => {
      let finishIndexing: (() => void) | undefined;
      const waitForDocCompleted = vi.fn(
        () =>
          new Promise<void>(resolve => {
            finishIndexing = resolve;
          })
      );
      const releaseDoc = vi.fn();
      const releaseIndexer = vi.fn();
      const watchRefsBySourceFrom = vi.fn(() => new Observable<never>());
      const gql = vi.fn(async () => {
        throw new UserFriendlyError({
          status: 403,
          code: 'FORBIDDEN',
          type: 'DOC_ACTION_DENIED',
          name: 'DOC_ACTION_DENIED',
          message: 'Doc is not readable',
        });
      });
      const framework = new Framework();
      framework.store(
        GuardStore,
        () =>
          new GuardStore(
            ...([
              { workspace: { id: 'space' } },
              { server: { gql } },
              {},
            ] as unknown as ConstructorParameters<typeof GuardStore>)
          )
      );
      const store = framework.provider().get(GuardStore);
      framework.service(
        GuardService,
        () =>
          new GuardService(
            ...([
              store,
              { workspace: { flavour: 'affine-cloud', openOptions: {} } },
              {
                permission: {
                  isOwner$: new LiveData(owner),
                  isAdmin$: new LiveData(false),
                },
              },
            ] as unknown as ConstructorParameters<typeof GuardService>)
          )
      );
      const guard = framework.provider().get(GuardService);
      const args = [
        {
          list: {
            docsMap$: new LiveData(new Map()),
            nonTrashDocsIds$: new LiveData([]),
          },
        },
        {
          watchRefsBySourceFrom,
          indexer: {
            addPriority: vi.fn(() => releaseIndexer),
            waitForDocCompleted,
          },
        },
        { favoriteList: { sortedList$: new LiveData([]) } },
        { globalContext: { docId: { $: new LiveData(null) } } },
        guard,
        {
          workspace: {
            engine: { doc: { addPriority: vi.fn(() => releaseDoc) } },
          },
        },
        { collectionMetas$: new LiveData([]) },
        {
          folderTree: {
            rootFolder: { sortedChildren$: new LiveData([]) },
          },
        },
        {
          tagList: {
            tags$: new LiveData([]),
            tagMetas$: new LiveData([]),
          },
        },
      ] as unknown as ConstructorParameters<typeof MobileShellDataProjection>;
      framework.service(
        MobileShellDataProjection,
        () => new MobileShellDataProjection(...args)
      );
      const projection = framework.provider().get(MobileShellDataProjection);
      const subscription = projection.refsByDoc$.subscribe();
      projection.setExpandedVisibleDocIds(['doc']);
      await Promise.resolve();
      await Promise.resolve();
      expect(waitForDocCompleted).toHaveBeenCalledTimes(owner ? 1 : 0);
      expect(gql).toHaveBeenCalledTimes(owner ? 0 : 1);
      await expect(guard.can('Doc_Read', 'doc')).resolves.toBe(owner);

      projection.dispose();
      finishIndexing?.();
      await Promise.resolve();

      expect(watchRefsBySourceFrom).toHaveBeenCalledTimes(owner ? 1 : 0);
      expect(releaseDoc).toHaveBeenCalledTimes(owner ? 1 : 0);
      expect(releaseIndexer).toHaveBeenCalledTimes(owner ? 1 : 0);
      for (const error of [
        new TypeError('offline'),
        new UserFriendlyError({
          status: 404,
          code: 'NOT_FOUND',
          type: 'DOC_NOT_FOUND',
          name: 'DOC_NOT_FOUND',
          message: 'Doc has not arrived yet',
        }),
        new UserFriendlyError({
          status: 500,
          code: 'INTERNAL_SERVER_ERROR',
          type: 'INTERNAL_SERVER_ERROR',
          name: 'INTERNAL_SERVER_ERROR',
          message: 'Upstream failed',
        }),
      ]) {
        gql.mockRejectedValueOnce(error);
        await expect(store.getDocPermissions('retryable')).rejects.toBe(error);
      }
      subscription.unsubscribe();
      guard.dispose();
    }
  );
});
