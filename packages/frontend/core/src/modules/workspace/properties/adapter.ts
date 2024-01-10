// the adapter is to bridge the workspace rootdoc & native js bindings

import { createYProxy, type Workspace, type Y } from '@blocksuite/store';
import { defaultsDeep } from 'lodash-es';

import {
  PagePropertyType,
  PageSystemPropertyId,
  type TagOption,
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
export class WorkspacePropertiesAdapter {
  // provides a easy-to-use interface for workspace properties
  private readonly proxy: WorkspaceAffineProperties;
  public readonly properties: Y.Map<any>;

  constructor(private readonly workspace: Workspace) {
    // check if properties exists, if not, create one
    const rootDoc = workspace.doc;
    this.properties = rootDoc.getMap(AFFINE_PROPERTIES_ID);
    this.proxy = createYProxy(this.properties);

    // fixme: deal with migration issue?
    this.ensureRootProperties();
  }

  private ensureRootProperties() {
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
              options: this.workspace.meta.properties.tags?.options ?? [], // better use a one time migration
            },
          },
        },
      },
      favouriates: {},
      pageProperties: {},
    });
  }

  private ensurePageProperties(pageId: string) {
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

  get schema() {
    return this.proxy.schema;
  }

  get favouriates() {
    return this.proxy.favouriates;
  }

  get pageProperties() {
    return this.proxy.pageProperties;
  }

  // ====== utilities ======

  getPageProperties(pageId: string) {
    return this.pageProperties[pageId];
  }

  isFavouriated(id: string, type: WorkspaceFavoriteItem['type']) {
    return this.favouriates[id]?.type === type;
  }

  isJournalPage(id: string) {
    this.ensurePageProperties(id);
    return !!this.getJournalPageDate(id);
  }

  getJournalPageDate(id: string) {
    this.ensurePageProperties(id);
    return this.pageProperties[id].system[PageSystemPropertyId.Journal].value;
  }

  setJournalPageDate(id: string, date: string) {
    this.ensurePageProperties(id);
    const pageProperties = this.pageProperties[id];
    pageProperties.system[PageSystemPropertyId.Journal].value = date;
  }

  get tagOptions() {
    return this.schema.pageProperties.system[PageSystemPropertyId.Tags].options;
  }

  // page tags could be reactive
  getPageTags(pageId: string) {
    this.ensurePageProperties(pageId);
    const tags =
      this.pageProperties[pageId].system[PageSystemPropertyId.Tags].value;
    const optionsMap = Object.fromEntries(this.tagOptions.map(o => [o.id, o]));
    return tags.map(tag => optionsMap[tag]).filter((t): t is TagOption => !!t);
  }

  addPageTag(pageId: string, tag: TagOption | string) {
    this.ensurePageProperties(pageId);
    const tags = this.getPageTags(pageId);
    const tagId = typeof tag === 'string' ? tag : tag.id;
    if (tags.some(t => t.id === tagId)) {
      return;
    }
    const pageProperties = this.pageProperties[pageId];
    pageProperties.system[PageSystemPropertyId.Tags].value.push(tagId);
  }

  removePageTag(pageId: string, tag: TagOption | string) {
    this.ensurePageProperties(pageId);
    const tags = this.getPageTags(pageId);
    const tagId = typeof tag === 'string' ? tag : tag.id;
    const index = tags.findIndex(t => t.id === tagId);
    if (index === -1) {
      return;
    }
    const pageProperties = this.pageProperties[pageId];
    pageProperties.system[PageSystemPropertyId.Tags].value.splice(index, 1);
  }
}
