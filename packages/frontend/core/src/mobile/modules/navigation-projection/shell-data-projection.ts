import type { CollectionService } from '@affine/core/modules/collection';
import type { DocsService } from '@affine/core/modules/doc';
import type {
  DocsSearchService,
  IndexedDocReference,
} from '@affine/core/modules/docs-search';
import type { FavoriteService } from '@affine/core/modules/favorite';
import type { GlobalContextService } from '@affine/core/modules/global-context';
import type {
  FolderNode,
  OrganizeService,
} from '@affine/core/modules/organize';
import type { GuardService } from '@affine/core/modules/permissions';
import type { TagService } from '@affine/core/modules/tag';
import type { WorkspaceService } from '@affine/core/modules/workspace';
import { LiveData, MANUALLY_STOP, Service } from '@toeverything/infra';
import { combineLatest, map, Observable, of, switchMap } from 'rxjs';

import type {
  MobileNavigationNode,
  MobileNavigationSection,
} from './navigation-projection';

export type MobileShellDocEntry = {
  id: string;
  title: string;
  trash: boolean;
  favorite: boolean;
  active: boolean;
  canRead: boolean | undefined;
  canUpdate: boolean | undefined;
};

export type MobileShellNavigationEntry = {
  key: string;
  kind: 'doc' | 'collection' | 'folder' | 'tag';
  id: string;
  name: string;
  color?: string;
  active: boolean;
  canRead?: boolean;
  canUpdate?: boolean;
};

const equalIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length &&
  left.every((id, index) => id === right[index]);

export class MobileShellDataProjection extends Service {
  private readonly entryCache = new Map<string, MobileShellDocEntry>();
  private readonly docEntries = new Map<
    string,
    LiveData<MobileShellDocEntry | undefined>
  >();
  private readonly readPermissions = new Map<
    string,
    LiveData<boolean | undefined>
  >();
  private readonly updatePermissions = new Map<
    string,
    LiveData<boolean | undefined>
  >();
  private readonly expandedDocIds = new Set<string>();
  private readonly collectionDocs = new Map<string, LiveData<string[]>>();
  private readonly navigationEntryCache = new Map<
    string,
    MobileShellNavigationEntry
  >();
  private readonly docNavigationEntries = new Map<
    string,
    LiveData<MobileShellNavigationEntry | undefined>
  >();
  private readonly referenceCache = new Map<string, IndexedDocReference[]>();
  private readonly expandedDocIds$ = new LiveData<readonly string[]>([]);
  private readonly permittedExpandedDocIds$ = LiveData.computed(get =>
    get(this.expandedDocIds$).filter(
      id => get(this.readPermission(id)) === true
    )
  );
  readonly visible$ = new LiveData(true);

  constructor(
    private readonly docs: DocsService,
    private readonly docsSearch: DocsSearchService,
    private readonly favorites: FavoriteService,
    private readonly globalContext: GlobalContextService,
    private readonly guard: GuardService,
    private readonly workspace: WorkspaceService,
    private readonly collections: CollectionService,
    private readonly organize: OrganizeService,
    private readonly tags: TagService
  ) {
    super();
  }

  entry$(id: string) {
    let entry$ = this.docEntries.get(id);
    if (!entry$) {
      const record$ = this.docs.list.doc$(id);
      entry$ = LiveData.computed(get => {
        const record = get(record$);
        if (!record) {
          this.entryCache.delete(id);
          return undefined;
        }
        const meta = get(record.meta$);
        const candidate: MobileShellDocEntry = {
          id,
          title: meta.title ?? '',
          trash: meta.trash ?? false,
          favorite: get(this.favorites.favoriteList.sortedList$).some(
            item => item.type === 'doc' && item.id === id
          ),
          active: get(this.globalContext.globalContext.docId.$) === id,
          canRead: get(this.readPermission(id)),
          canUpdate: get(this.updatePermission(id)),
        };
        const cached = this.entryCache.get(id);
        if (
          cached &&
          cached.title === candidate.title &&
          cached.trash === candidate.trash &&
          cached.favorite === candidate.favorite &&
          cached.active === candidate.active &&
          cached.canRead === candidate.canRead &&
          cached.canUpdate === candidate.canUpdate
        ) {
          return cached;
        }
        this.entryCache.set(id, candidate);
        return candidate;
      }).distinctUntilChanged((previous, current) => previous === current);
      this.docEntries.set(id, entry$);
    }
    return entry$;
  }

  readonly navigationEntries$ = LiveData.computed(get => {
    const entries = new Map<string, MobileShellNavigationEntry>();
    const activeCollection = get(
      this.globalContext.globalContext.collectionId.$
    );
    const activeTag = get(this.globalContext.globalContext.tagId.$);
    const add = (candidate: MobileShellNavigationEntry) => {
      const cached = this.navigationEntryCache.get(candidate.key);
      const entry =
        cached &&
        cached.name === candidate.name &&
        cached.color === candidate.color &&
        cached.active === candidate.active
          ? cached
          : candidate;
      this.navigationEntryCache.set(entry.key, entry);
      entries.set(entry.key, entry);
    };
    for (const collection of get(this.collections.collectionMetas$)) {
      add({
        key: `collection:${collection.id}`,
        kind: 'collection',
        id: collection.id,
        name: collection.name,
        active: activeCollection === collection.id,
      });
    }
    for (const tag of get(this.tags.tagList.tagMetas$)) {
      add({
        key: `tag:${tag.id}`,
        kind: 'tag',
        id: tag.id,
        name: tag.name,
        color: tag.color,
        active: activeTag === tag.id,
      });
    }
    const visitFolder = (node: FolderNode, ancestors: ReadonlySet<string>) => {
      const id = node.id;
      if (!id || ancestors.has(id)) return;
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(id);
      const type = get(node.type$);
      if (type === 'folder') {
        add({
          key: `folder:${id}`,
          kind: 'folder',
          id,
          name: get(node.name$),
          active: false,
        });
        get(node.sortedChildren$).forEach(child =>
          visitFolder(child, nextAncestors)
        );
      }
    };
    get(this.organize.folderTree.rootFolder.sortedChildren$).forEach(node =>
      visitFolder(node, new Set())
    );
    for (const key of this.navigationEntryCache.keys()) {
      if (!entries.has(key)) this.navigationEntryCache.delete(key);
    }
    return entries;
  });

  navigationEntry$(kind: MobileShellNavigationEntry['kind'], id: string) {
    if (kind === 'doc') {
      let entry$ = this.docNavigationEntries.get(id);
      if (!entry$) {
        let cached: MobileShellNavigationEntry | undefined;
        const created$ = LiveData.computed<
          MobileShellNavigationEntry | undefined
        >(get => {
          const doc = get(this.entry$(id));
          if (!doc) return undefined;
          const key = `doc:${id}`;
          const candidate: MobileShellNavigationEntry = {
            key,
            kind: 'doc',
            id,
            name: doc.title,
            active: doc.active,
            canRead: doc.canRead,
            canUpdate: doc.canUpdate,
          };
          if (
            cached &&
            cached.name === candidate.name &&
            cached.active === candidate.active &&
            cached.canRead === candidate.canRead &&
            cached.canUpdate === candidate.canUpdate
          ) {
            return cached;
          }
          cached = candidate;
          return candidate;
        }).distinctUntilChanged((previous, current) => previous === current);
        this.docNavigationEntries.set(id, created$);
        entry$ = created$;
      }
      return entry$;
    }
    return this.navigationEntries$.selector(entries =>
      entries.get(`${kind}:${id}`)
    );
  }

  readonly navigationSections$ = LiveData.computed(get => {
    const refsByDoc = get(this.refsByDoc$);
    const nonTrashDocIds = new Set(get(this.docs.list.nonTrashDocsIds$));
    const docNode = (
      id: string,
      linked = false,
      ancestors: ReadonlySet<string> = new Set()
    ): MobileNavigationNode | undefined => {
      if (!nonTrashDocIds.has(id)) return undefined;
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(id);
      return {
        kind: 'doc',
        entityId: id,
        linked,
        expandable: true,
        children: ancestors.has(id)
          ? []
          : [
              ...(refsByDoc.get(id)?.flatMap(reference => {
                const child = docNode(reference.docId, true, nextAncestors);
                return child ? [child] : [];
              }) ?? []),
              { kind: 'action', entityId: id, action: 'doc-new-linked' },
            ],
      };
    };
    const collectionNode = (
      id: string,
      relationId?: string
    ): MobileNavigationNode => ({
      kind: 'collection',
      entityId: id,
      linked: !!relationId,
      relationId,
      expandable: true,
      children: [
        ...get(this.collectionDocsFor(id)).flatMap(docId => {
          const child = docNode(docId, true);
          return child ? [child] : [];
        }),
        { kind: 'action', entityId: id, action: 'collection-new-doc' },
      ],
    });
    const tagNode = (id: string, relationId?: string): MobileNavigationNode => {
      const tag = get(this.tags.tagList.tagByTagId$(id));
      return {
        kind: 'tag',
        entityId: id,
        linked: !!relationId,
        relationId,
        expandable: true,
        children: [
          ...(tag
            ? get(tag.pageIds$).flatMap(docId => {
                const child = docNode(docId, true);
                return child ? [child] : [];
              })
            : []),
          { kind: 'action', entityId: id, action: 'tag-new-doc' },
        ],
      };
    };
    const folderNode = (
      node: FolderNode,
      ancestors: ReadonlySet<string>
    ): MobileNavigationNode | undefined => {
      const id = node.id ?? '';
      const type = get(node.type$);
      const data = get(node.data$);
      if (type === 'doc' && data) {
        const doc = docNode(data, true);
        return doc ? { ...doc, relationId: id } : undefined;
      }
      if (type === 'collection' && data) return collectionNode(data, id);
      if (type === 'tag' && data) return tagNode(data, id);
      if (type !== 'folder') return { kind: 'folder', entityId: id };
      if (ancestors.has(id)) {
        return { kind: 'folder', entityId: id, children: [] };
      }
      const nextAncestors = new Set(ancestors);
      nextAncestors.add(id);
      return {
        kind: 'folder',
        entityId: id,
        children: [
          ...get(node.sortedChildren$).flatMap(child => {
            const projected = folderNode(child, nextAncestors);
            return projected ? [projected] : [];
          }),
          { kind: 'action', entityId: id, action: 'folder-new-doc' },
        ],
      };
    };

    const favorites = get(this.favorites.favoriteList.sortedList$).flatMap(
      item => {
        let projected: MobileNavigationNode | undefined;
        if (item.type === 'doc') {
          projected = docNode(item.id);
        } else if (item.type === 'collection') {
          projected = collectionNode(item.id);
        } else if (item.type === 'tag') {
          projected = tagNode(item.id);
        } else {
          const folder = get(this.organize.folderTree.folderNode$(item.id));
          projected = folder ? folderNode(folder, new Set()) : undefined;
        }
        return projected ? [projected] : [];
      }
    );
    const folders = get(
      this.organize.folderTree.rootFolder.sortedChildren$
    ).flatMap(node => {
      const projected = folderNode(node, new Set());
      return projected ? [projected] : [];
    });
    const collections = get(this.collections.collectionMetas$).map(meta =>
      collectionNode(meta.id)
    );
    const tags = get(this.tags.tagList.tags$).map(tag => tagNode(tag.id));

    return [
      {
        id: 'favorites',
        children: [
          ...favorites,
          { kind: 'action', entityId: 'favorites', action: 'section' },
        ],
      },
      {
        id: 'organize',
        children: [
          ...folders,
          { kind: 'action', entityId: 'organize', action: 'section' },
        ],
      },
      {
        id: 'collections',
        children: [
          ...collections,
          { kind: 'action', entityId: 'collections', action: 'section' },
        ],
      },
      {
        id: 'tags',
        children: [
          ...tags,
          { kind: 'action', entityId: 'tags', action: 'section' },
        ],
      },
    ] satisfies MobileNavigationSection[];
  });

  readonly refsByDoc$: LiveData<Map<string, IndexedDocReference[]>> =
    LiveData.from(
      combineLatest([
        this.expandedDocIds$,
        this.permittedExpandedDocIds$,
        this.visible$,
      ]).pipe(
        switchMap(([requestedIds, ids, visible]) => {
          const permitted = new Set(ids);
          requestedIds.forEach(id => {
            if (!permitted.has(id)) this.referenceCache.delete(id);
          });
          if (!visible || ids.length === 0) {
            return of(new Map(this.referenceCache));
          }
          return new Observable<Map<string, IndexedDocReference[]>>(
            subscriber => {
              const abortController = new AbortController();
              const releasePriorities = ids.flatMap(id => [
                this.workspace.workspace.engine.doc.addPriority(id, 10),
                this.docsSearch.indexer.addPriority(id, 10),
              ]);
              const subscription = this.docsSearch
                .watchRefsBySourceFrom([...ids])
                .subscribe(subscriber);
              ids.forEach(id => {
                this.docsSearch.indexer
                  .waitForDocCompleted(id, abortController.signal)
                  .catch(error => {
                    if (error !== MANUALLY_STOP) subscriber.error(error);
                  });
              });
              return () => {
                abortController.abort(MANUALLY_STOP);
                subscription.unsubscribe();
                releasePriorities.forEach(release => release());
              };
            }
          );
        }),
        map(refsByDoc => {
          for (const [id, refs] of refsByDoc) {
            this.referenceCache.set(id, refs);
          }
          return new Map(this.referenceCache);
        })
      ),
      new Map<string, IndexedDocReference[]>()
    );

  setExpandedVisibleDocIds(ids: Iterable<string>) {
    const next = [...new Set(ids)].sort();
    if (!equalIds(this.expandedDocIds$.value, next)) {
      this.expandedDocIds$.next(next);
    }
  }

  registerExpandedDoc(id: string) {
    this.expandedDocIds.add(id);
    this.setExpandedVisibleDocIds(this.expandedDocIds);
    return () => {
      this.expandedDocIds.delete(id);
      this.setExpandedVisibleDocIds(this.expandedDocIds);
    };
  }

  private readPermission(id: string) {
    let permission$ = this.readPermissions.get(id);
    if (!permission$) {
      permission$ = this.guard.can$('Doc_Read', id);
      this.readPermissions.set(id, permission$);
    }
    return permission$;
  }

  private updatePermission(id: string) {
    let permission$ = this.updatePermissions.get(id);
    if (!permission$) {
      permission$ = this.guard.can$('Doc_Update', id);
      this.updatePermissions.set(id, permission$);
    }
    return permission$;
  }

  private collectionDocsFor(id: string) {
    let docs$ = this.collectionDocs.get(id);
    if (!docs$) {
      docs$ = LiveData.from(
        this.collections
          .collection$(id)
          .pipe(
            switchMap(collection => (collection ? collection.watch() : of([])))
          ),
        []
      );
      this.collectionDocs.set(id, docs$);
    }
    return docs$;
  }

  override dispose(): void {
    this.visible$.next(false);
    this.expandedDocIds.clear();
    this.expandedDocIds$.next([]);
    this.entryCache.clear();
    this.docEntries.clear();
    this.readPermissions.clear();
    this.updatePermissions.clear();
    this.collectionDocs.clear();
    this.navigationEntryCache.clear();
    this.docNavigationEntries.clear();
    this.referenceCache.clear();
    super.dispose();
  }
}
