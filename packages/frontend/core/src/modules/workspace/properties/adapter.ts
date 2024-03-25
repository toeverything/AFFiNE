/* eslint-disable @typescript-eslint/no-non-null-assertion */
// the adapter is to bridge the workspace rootdoc & native js bindings

import type { Y } from '@blocksuite/store';
import { createYProxy } from '@blocksuite/store';
import type { Workspace } from '@toeverything/infra';
import { defaultsDeep } from 'lodash-es';

import type {
  WorkspaceAffineProperties,
  WorkspaceFavoriteItem,
} from './schema';
import { PagePropertyType, PageSystemPropertyId } from './schema';

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
export class WorkspacePropertiesAdapter {
  // provides a easy-to-use interface for workspace properties
  public readonly proxy: WorkspaceAffineProperties;
  public readonly properties: Y.Map<any>;

  private ensuredRoot = false;
  private ensuredPages = {} as Record<string, boolean>;

  constructor(public readonly workspace: Workspace) {
    // check if properties exists, if not, create one
    const rootDoc = workspace.docCollection.doc;
    this.properties = rootDoc.getMap(AFFINE_PROPERTIES_ID);
    this.proxy = createYProxy(this.properties);
  }

  private ensureRootProperties() {
    if (this.ensuredRoot) {
      return;
    }
    this.ensuredRoot = true;
    // todo: deal with schema change issue
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
                this.workspace.docCollection.meta.properties.tags?.options ??
                [], // better use a one time migration
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
  transact = this.workspace.docCollection.doc.transact.bind(
    this.workspace.docCollection.doc
  );

  get schema() {
    return this.proxy.schema;
  }

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

  isFavorite(id: string, type: WorkspaceFavoriteItem['type']) {
    return this.favorites?.[id]?.type === type;
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
}
