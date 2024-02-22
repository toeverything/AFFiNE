import type { WorkspacePropertiesAdapter } from '@affine/core/modules/workspace';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  TagOption,
} from '@affine/core/modules/workspace/properties/schema';
import { PagePropertyType } from '@affine/core/modules/workspace/properties/schema';
import { DebugLogger } from '@affine/debug';
import { nanoid } from 'nanoid';

import { getDefaultIconName } from './icons-mapping';

const logger = new DebugLogger('PagePropertiesManager');

function validatePropertyValue(type: PagePropertyType, value: any) {
  switch (type) {
    case PagePropertyType.Text:
      return typeof value === 'string';
    case PagePropertyType.Number:
      return typeof value === 'number' || !isNaN(+value);
    case PagePropertyType.Checkbox:
      return typeof value === 'boolean';
    case PagePropertyType.Date:
      return value.match(/^\d{4}-\d{2}-\d{2}$/);
    case PagePropertyType.Tags:
      return Array.isArray(value) && value.every(v => typeof v === 'string');
    default:
      return false;
  }
}

export interface NewPropertyOption {
  name: string;
  type: PagePropertyType;
}

export const newPropertyOptions: NewPropertyOption[] = [
  // todo: name i18n?
  {
    name: 'Text',
    type: PagePropertyType.Text,
  },
  {
    name: 'Number',
    type: PagePropertyType.Number,
  },
  {
    name: 'Checkbox',
    type: PagePropertyType.Checkbox,
  },
  {
    name: 'Date',
    type: PagePropertyType.Date,
  },
  // todo: add more
];

export class PagePropertiesMetaManager {
  constructor(private readonly adapter: WorkspacePropertiesAdapter) {}

  get tagOptions() {
    return this.adapter.tagOptions;
  }

  get propertiesSchema() {
    return this.adapter.schema.pageProperties;
  }

  get systemPropertiesSchema() {
    return this.adapter.schema.pageProperties.system;
  }

  get customPropertiesSchema() {
    return this.adapter.schema.pageProperties.custom;
  }

  getOrderedCustomPropertiesSchema() {
    return Object.values(this.customPropertiesSchema).sort(
      (a, b) => a.order - b.order
    );
  }

  checkPropertyExists(id: string) {
    return !!this.customPropertiesSchema[id];
  }

  validateCustomPropertyValue(id: string, value?: any) {
    if (!value) {
      // value is optional in all cases?
      return true;
    }
    const type = this.customPropertiesSchema[id]?.type;
    if (!type) {
      logger.warn(`property ${id} not found`);
      return false;
    }
    return validatePropertyValue(type, value);
  }

  addCustomPropertyMeta(schema: {
    name: string;
    type: PagePropertyType;
    icon?: string;
  }) {
    const id = nanoid();
    const { type, icon } = schema;
    const newOrder =
      Math.max(
        0,
        ...Object.values(this.customPropertiesSchema).map(p => p.order)
      ) + 1;
    const property = {
      ...schema,
      id,
      source: 'custom',
      type,
      order: newOrder,
      icon: icon ?? getDefaultIconName(type),
    } as const;
    this.customPropertiesSchema[id] = property;
    return property;
  }

  removeCustomPropertyMeta(id: string) {
    // should warn if the property is in use
    delete this.customPropertiesSchema[id];
  }

  // returns page schema properties -> related page
  getCustomPropertyStatistics() {
    const mapping = new Map<string, Set<string>>();
    for (const page of this.adapter.workspace.blockSuiteWorkspace.pages.values()) {
      const properties = this.adapter.getPageProperties(page.id);
      for (const id of Object.keys(properties.custom)) {
        if (!mapping.has(id)) mapping.set(id, new Set());
        mapping.get(id)?.add(page.id);
      }
    }
  }
}

export class PagePropertiesManager {
  public readonly metaManager: PagePropertiesMetaManager;
  constructor(
    private readonly adapter: WorkspacePropertiesAdapter,
    public readonly pageId: string
  ) {
    this.adapter.ensurePageProperties(this.pageId);
    this.metaManager = new PagePropertiesMetaManager(this.adapter);
  }

  get workspace() {
    return this.adapter.workspace;
  }

  get page() {
    return this.adapter.workspace.blockSuiteWorkspace.getPage(this.pageId);
  }

  get intrinsicMeta() {
    return this.page?.meta;
  }

  get updatedDate() {
    return this.intrinsicMeta?.updatedDate;
  }

  get createDate() {
    return this.intrinsicMeta?.createDate;
  }

  get pageTags() {
    return this.adapter.getPageTags(this.pageId);
  }

  get properties() {
    return this.adapter.getPageProperties(this.pageId);
  }

  get readonly() {
    return !!this.page?.readonly;
  }

  addPageTag(pageId: string, tag: TagOption | string) {
    this.adapter.addPageTag(pageId, tag);
  }

  removePageTag(pageId: string, tag: TagOption | string) {
    this.adapter.removePageTag(pageId, tag);
  }

  /**
   * get custom properties (filter out properties that are not in schema)
   */
  getCustomProperties() {
    return Object.fromEntries(
      Object.entries(this.properties.custom).filter(([id]) =>
        this.metaManager.checkPropertyExists(id)
      )
    );
  }

  getOrderedCustomProperties() {
    return Object.values(this.getCustomProperties()).sort(
      (a, b) => a.order - b.order
    );
  }

  largestOrder() {
    return Math.max(
      ...Object.values(this.properties.custom).map(p => p.order),
      0
    );
  }

  leastOrder() {
    return Math.min(
      ...Object.values(this.properties.custom).map(p => p.order),
      0
    );
  }

  getCustomPropertyMeta(id: string): PageInfoCustomPropertyMeta | undefined {
    return this.metaManager.customPropertiesSchema[id];
  }

  getCustomProperty(id: string) {
    return this.properties.custom[id];
  }

  addCustomProperty(id: string, value?: any) {
    if (!this.metaManager.checkPropertyExists(id)) {
      logger.warn(`property ${id} not found`);
      return;
    }

    if (!this.metaManager.validateCustomPropertyValue(id, value)) {
      logger.warn(`property ${id} value ${value} is invalid`);
      return;
    }

    const newOrder = this.largestOrder() + 1;
    if (this.properties.custom[id]) {
      logger.warn(`custom property ${id} already exists`);
    }

    this.properties.custom[id] = {
      id,
      value,
      order: newOrder,
      visibility: 'visible',
    };
  }

  hasCustomProperty(id: string) {
    return !!this.properties.custom[id];
  }

  removeCustomProperty(id: string) {
    delete this.properties.custom[id];
  }

  updateCustomProperty(id: string, opt: Partial<PageInfoCustomProperty>) {
    if (!this.properties.custom[id]) {
      logger.warn(`custom property ${id} not found`);
      return;
    }
    if (
      opt.value !== undefined &&
      !this.metaManager.validateCustomPropertyValue(id, opt.value)
    ) {
      logger.warn(`property ${id} value ${opt.value} is invalid`);
      return;
    }
    Object.assign(this.properties.custom[id], opt);
  }

  updateCustomPropertyMeta(
    id: string,
    opt: Partial<PageInfoCustomPropertyMeta>
  ) {
    if (!this.metaManager.checkPropertyExists(id)) {
      logger.warn(`property ${id} not found`);
      return;
    }
    Object.assign(this.metaManager.customPropertiesSchema[id], opt);
  }

  transact = this.adapter.transact;
}
