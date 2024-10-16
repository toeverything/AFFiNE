/* eslint-disable @typescript-eslint/no-non-null-assertion */
// the adapter is to bridge the workspace rootdoc & native js bindings
import { createYProxy, type Y } from '@blocksuite/affine/store';
import type { WorkspaceService } from '@toeverything/infra';
import { LiveData, Service } from '@toeverything/infra';
import { defaultsDeep } from 'lodash-es';
import { Observable } from 'rxjs';

import type { FavoriteSupportType } from '../../constant';
import type { FavoriteService } from '../favorite';
import {
  PagePropertyType,
  PageSystemPropertyId,
  type WorkspaceAffineProperties,
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
 *
 * @deprecated use docService.doc.properties$
 */
class WorkspacePropertiesAdapter {
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
  markFavoritesMigrated() {
    this.proxy.favoritesMigrated = true;
  }
}

export class MigrationFavoriteItemsAdapter extends Service {
  adapter = new WorkspacePropertiesAdapter(this.workspaceService);

  constructor(public readonly workspaceService: WorkspaceService) {
    super();
  }

  favorites$ = this.adapter.properties$.map(() =>
    this.getItems().filter(i => i.value)
  );

  migrated$ = this.adapter.properties$.map(
    props => props.favoritesMigrated ?? false
  );

  getItems() {
    return Object.entries(this.adapter.favorites ?? {})
      .filter(([k]) => k.includes(':'))
      .map(([, v]) => v);
  }

  markFavoritesMigrated() {
    this.adapter.markFavoritesMigrated();
  }
}

type CompatibleFavoriteSupportType = FavoriteSupportType;

/**
 * A service written for compatibility,with the same API as old FavoriteItemsAdapter.
 */
export class CompatibleFavoriteItemsAdapter extends Service {
  constructor(private readonly favoriteService: FavoriteService) {
    super();
  }

  toggle(id: string, type: CompatibleFavoriteSupportType) {
    this.favoriteService.favoriteList.toggle(type, id);
  }

  isFavorite$(id: string, type: CompatibleFavoriteSupportType) {
    return this.favoriteService.favoriteList.isFavorite$(type, id);
  }

  isFavorite(id: string, type: CompatibleFavoriteSupportType) {
    return this.favoriteService.favoriteList.isFavorite$(type, id).value;
  }

  get favorites$() {
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
  }
}
