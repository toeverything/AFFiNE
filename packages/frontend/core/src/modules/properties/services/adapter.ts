/* eslint-disable @typescript-eslint/no-non-null-assertion */
// the adapter is to bridge the workspace rootdoc & native js bindings
import { createFractionalIndexingSortableHelper } from '@affine/core/utils';
import { createYProxy, type Y } from '@blocksuite/store';
import type { WorkspaceService } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import { defaultsDeep } from 'lodash-es';
import { Observable } from 'rxjs';

import type { FavoriteService } from '../../favorite';
import {
  PagePropertyType,
  PageSystemPropertyId,
  type WorkspaceAffineProperties,
  type WorkspaceFavoriteItem,
} from './schema';

const AFFINE_PROPERTIES_ID = 'affine:workspace-properties';

/**
 * WorkspacePropertiesAdapter is a wrapper for workspace properties.
 * Users should not directly access the workspace properties via yjs, but use this adapter instead.
 *
 * Question for enhancement in the future:
 * May abstract the adapter for each property type, e.g. PagePropertiesAdapter, SchemaAdapter, etc.
 * So that the adapter could be more focused and easier to maintain (like assigning default values)
 * However the properties for an abstraction may not be limited to a single yjs map.
 */
export class WorkspacePropertiesAdapter extends Service {
  // provides a easy-to-use interface for workspace properties
  public readonly proxy: WorkspaceAffineProperties;
  public readonly properties: Y.Map<any>;
  public readonly properties$: LiveData<WorkspaceAffineProperties>;

  private ensuredRoot = false;
  private ensuredPages = {} as Record<string, boolean>;

  get workspace() {
    return this.workspaceService.workspace;
  }

  constructor(public readonly workspaceService: WorkspaceService) {
    super();
    // check if properties exists, if not, create one
    const rootDoc = workspaceService.workspace.docCollection.doc;
    this.properties = rootDoc.getMap(AFFINE_PROPERTIES_ID);
    this.proxy = createYProxy(this.properties);

    this.properties$ = LiveData.from(
      new Observable(observer => {
        const update = () => {
          requestAnimationFrame(() => {
            observer.next(new Proxy(this.proxy, {}));
          });
        };
        update();
        this.properties.observeDeep(update);
        return () => {
          this.properties.unobserveDeep(update);
        };
      }),
      this.proxy
    );
  }

  public ensureRootProperties() {
    if (this.ensuredRoot) {
      return;
    }
    this.ensuredRoot = true;
    // TODO(@Peng): deal with schema change issue
    // fixme: may not to be called every time
    defaultsDeep(this.proxy, {
      schema: {
        pageProperties: {
          custom: {},
          system: {
            journal: {
              id: PageSystemPropertyId.Journal,
              name: 'Journal',
              source: 'system',
              type: PagePropertyType.Date,
            },
            tags: {
              id: PageSystemPropertyId.Tags,
              name: 'Tags',
              source: 'system',
              type: PagePropertyType.Tags,
              options:
                this.workspaceService.workspace.docCollection.meta.properties
                  .tags?.options ?? [], // better use a one time migration
            },
          },
        },
      },
      favorites: {},
      pageProperties: {},
    });
  }

  ensurePageProperties(pageId: string) {
    this.ensureRootProperties();
    if (this.ensuredPages[pageId]) {
      return;
    }
    this.ensuredPages[pageId] = true;
    // fixme: may not to be called every time
    defaultsDeep(this.proxy.pageProperties, {
      [pageId]: {
        custom: {},
        system: {
          [PageSystemPropertyId.Journal]: {
            id: PageSystemPropertyId.Journal,
            value: false,
          },
          [PageSystemPropertyId.Tags]: {
            id: PageSystemPropertyId.Tags,
            value: [],
          },
        },
      },
    });
  }

  // leak some yjs abstraction to modify multiple properties at once
  transact = this.workspaceService.workspace.docCollection.doc.transact.bind(
    this.workspaceService.workspace.docCollection.doc
  );

  get schema() {
    return this.proxy.schema;
  }

  /**
   * @deprecated
   */
  get favorites() {
    return this.proxy.favorites;
  }

  get pageProperties() {
    return this.proxy.pageProperties;
  }

  // ====== utilities ======

  getPageProperties(pageId: string) {
    return this.pageProperties?.[pageId] ?? null;
  }

  getJournalPageDateString(id: string) {
    return this.pageProperties?.[id]?.system[PageSystemPropertyId.Journal]
      ?.value;
  }

  setJournalPageDateString(id: string, date: string) {
    this.ensurePageProperties(id);
    const pageProperties = this.pageProperties?.[id];
    pageProperties!.system[PageSystemPropertyId.Journal].value = date;
  }

  /**
   * After the user completes the migration, call this function to clear the favorite data
   */
  cleanupFavorites() {
    this.proxy.favorites = {};
  }
}

/**
 * @deprecated use CompatibleFavoriteItemsAdapter
 */
export class FavoriteItemsAdapter extends Service {
  constructor(private readonly adapter: WorkspacePropertiesAdapter) {
    super();
    this.migrateFavorites();
  }

  readonly sorter = createFractionalIndexingSortableHelper<
    WorkspaceFavoriteItem,
    string
  >(this);

  static getFavItemKey(id: string, type: WorkspaceFavoriteItem['type']) {
    return `${type}:${id}`;
  }

  favorites$ = this.adapter.properties$.map(() =>
    this.getItems().filter(i => i.value)
  );

  orderedFavorites$ = this.adapter.properties$.map(() => {
    const seen = new Set<string>();
    return this.sorter.getOrderedItems().filter(item => {
      const key = FavoriteItemsAdapter.getFavItemKey(item.id, item.type);
      if (seen.has(key) || !item.value) {
        return null;
      }
      seen.add(key);
      return item;
    });
  });

  getItems() {
    return Object.entries(this.adapter.favorites ?? {})
      .filter(([k]) => k.includes(':'))
      .map(([, v]) => v);
  }

  get favorites() {
    return this.adapter.favorites;
  }

  get workspace() {
    return this.adapter.workspaceService.workspace;
  }

  getItemId(item: WorkspaceFavoriteItem) {
    return FavoriteItemsAdapter.getFavItemKey(item.id, item.type);
  }

  getItemOrder(item: WorkspaceFavoriteItem) {
    return item.order;
  }

  setItemOrder(item: WorkspaceFavoriteItem, order: string) {
    item.order = order;
  }

  // read from the workspace meta and migrate to the properties
  private migrateFavorites() {
    // only migrate if favorites is empty
    if (Object.keys(this.favorites ?? {}).length > 0) {
      return;
    }

    // old favorited pages
    const oldFavorites = this.workspace.docCollection.meta.docMetas
      .filter(meta => meta.favorite)
      .map(meta => meta.id);

    this.adapter.transact(() => {
      for (const id of oldFavorites) {
        this.set(id, 'doc', true);
      }
    });
  }

  isFavorite(id: string, type: WorkspaceFavoriteItem['type']) {
    const existing = this.getFavoriteItem(id, type);
    return existing?.value ?? false;
  }

  isFavorite$(id: string, type: WorkspaceFavoriteItem['type']) {
    return this.favorites$.map(() => {
      return this.isFavorite(id, type);
    });
  }

  private getFavoriteItem(id: string, type: WorkspaceFavoriteItem['type']) {
    return this.favorites?.[FavoriteItemsAdapter.getFavItemKey(id, type)];
  }

  // add or set a new fav item to the list. note the id added with prefix
  set(
    id: string,
    type: WorkspaceFavoriteItem['type'],
    value: boolean,
    order?: string
  ) {
    this.adapter.ensureRootProperties();
    if (!this.favorites) {
      throw new Error('Favorites is not initialized');
    }
    const existing = this.getFavoriteItem(id, type);
    if (!existing) {
      this.favorites[FavoriteItemsAdapter.getFavItemKey(id, type)] = {
        id,
        type,
        value: true,
        order: order ?? this.sorter.getNewItemOrder(),
      };
    } else {
      Object.assign(existing, {
        value,
        order: order ?? existing.order,
      });
    }
  }

  toggle(id: string, type: WorkspaceFavoriteItem['type']) {
    this.set(id, type, !this.isFavorite(id, type));
  }

  remove(id: string, type: WorkspaceFavoriteItem['type']) {
    this.adapter.ensureRootProperties();
    const existing = this.getFavoriteItem(id, type);
    if (existing) {
      existing.value = false;
    }
  }

  clearAll() {
    this.adapter.cleanupFavorites();
  }
}

/**
 * A service written for compatibility,with the same API as FavoriteItemsAdapter.
 * When `runtimeConfig.enableNewFavorite` is false, it operates FavoriteItemsAdapter,
 * and when it is true, it operates FavoriteService.
 */
export class CompatibleFavoriteItemsAdapter extends Service {
  constructor(
    private readonly favoriteItemsAdapter: FavoriteItemsAdapter,
    private readonly favoriteService: FavoriteService
  ) {
    super();
  }

  toggle(id: string, type: WorkspaceFavoriteItem['type']) {
    if (runtimeConfig.enableNewFavorite) {
      this.favoriteService.favoriteList.toggle(type, id);
    } else {
      this.favoriteItemsAdapter.toggle(id, type);
    }
  }

  isFavorite$(id: string, type: WorkspaceFavoriteItem['type']) {
    if (runtimeConfig.enableNewFavorite) {
      return this.favoriteService.favoriteList.isFavorite$(type, id);
    } else {
      return this.favoriteItemsAdapter.isFavorite$(id, type);
    }
  }

  isFavorite(id: string, type: WorkspaceFavoriteItem['type']) {
    if (runtimeConfig.enableNewFavorite) {
      return this.favoriteService.favoriteList.isFavorite$(type, id).value;
    } else {
      return this.favoriteItemsAdapter.isFavorite(id, type);
    }
  }

  get favorites$() {
    if (runtimeConfig.enableNewFavorite) {
      return this.favoriteService.favoriteList.list$.map<
        {
          id: string;
          order: string;
          type: 'doc' | 'collection';
          value: boolean;
        }[]
      >(v =>
        v
          .filter(i => i.type === 'doc' || i.type === 'collection') // only support doc and collection
          .map(i => ({
            id: i.id,
            order: '',
            type: i.type as 'doc' | 'collection',
            value: true,
          }))
      );
    } else {
      return this.favoriteItemsAdapter.favorites$;
    }
  }
}
