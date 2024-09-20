/* eslint-disable @typescript-eslint/no-non-null-assertion */
import type { WorkspacePropertiesAdapter } from '@affine/core/modules/properties';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
} from '@affine/core/modules/properties/services/schema';
import { PagePropertyType } from '@affine/core/modules/properties/services/schema';
import { createFractionalIndexingSortableHelper } from '@affine/core/utils';
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

export const newPropertyTypes: PagePropertyType[] = [
  PagePropertyType.Text,
  PagePropertyType.Number,
  PagePropertyType.Checkbox,
  PagePropertyType.Date,
  PagePropertyType.CreatedBy,
  PagePropertyType.UpdatedBy,
  // TODO(@Peng): add more
];

export const readonlyPropertyTypes: PagePropertyType[] = [
  PagePropertyType.CreatedBy,
  PagePropertyType.UpdatedBy,
];

export class PagePropertiesMetaManager {
  constructor(private readonly adapter: WorkspacePropertiesAdapter) {}

  get propertiesSchema() {
    return this.adapter.schema?.pageProperties ?? {};
  }

  get systemPropertiesSchema() {
    return this.adapter.schema?.pageProperties.system ?? {};
  }

  get customPropertiesSchema() {
    return this.adapter.schema?.pageProperties.custom ?? {};
  }

  getOrderedPropertiesSchema() {
    return Object.values(this.customPropertiesSchema).sort(
      (a, b) => a.order - b.order
    );
  }

  checkPropertyExists(id: string) {
    return !!this.customPropertiesSchema[id];
  }

  validatePropertyValue(id: string, value?: any) {
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

  addPropertyMeta(schema: {
    name: string;
    type: PagePropertyType;
    icon?: string;
  }) {
    this.adapter.ensureRootProperties();
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
      readonly: readonlyPropertyTypes.includes(type) || undefined,
    } as const;
    this.customPropertiesSchema[id] = property;
    return property;
  }

  updatePropertyMeta(id: string, opt: Partial<PageInfoCustomPropertyMeta>) {
    this.adapter.ensureRootProperties();
    if (!this.checkPropertyExists(id)) {
      logger.warn(`property ${id} not found`);
      return;
    }
    Object.assign(this.customPropertiesSchema[id], opt);
  }

  isPropertyRequired(id: string) {
    return this.customPropertiesSchema[id]?.required;
  }

  removePropertyMeta(id: string) {
    // should warn if the property is in use
    this.adapter.ensureRootProperties();
    delete this.customPropertiesSchema[id];
  }

  // returns page schema properties -> related page
  getPropertyStatistics() {
    const mapping = new Map<string, Set<string>>();
    for (const page of this.adapter.workspace.docCollection.docs.values()) {
      const properties = this.adapter.getPageProperties(page.id);
      if (properties) {
        for (const id of Object.keys(properties.custom)) {
          if (!mapping.has(id)) mapping.set(id, new Set());
          mapping.get(id)?.add(page.id);
        }
      }
    }
    return mapping;
  }

  getPropertyRelatedPages(id: string) {
    return this.getPropertyStatistics().get(id);
  }
}

export class PagePropertiesManager {
  public readonly metaManager: PagePropertiesMetaManager;
  constructor(
    private readonly adapter: WorkspacePropertiesAdapter,
    public readonly pageId: string
  ) {
    this.metaManager = new PagePropertiesMetaManager(this.adapter);
    this.ensureRequiredProperties();
  }

  readonly sorter = createFractionalIndexingSortableHelper<
    PageInfoCustomProperty,
    string | number
  >(this);

  // prevent infinite loop
  private ensuring = false;
  ensureRequiredProperties() {
    this.adapter.ensurePageProperties(this.pageId);
    if (this.ensuring) return;
    this.ensuring = true;
    this.transact(() => {
      this.metaManager.getOrderedPropertiesSchema().forEach(property => {
        if (property.required && !this.hasCustomProperty(property.id)) {
          this.addCustomProperty(property.id);
        }
      });
    });
    this.ensuring = false;
  }

  getItems() {
    return Object.values(this.getCustomProperties());
  }

  getItemOrder(item: PageInfoCustomProperty): string {
    return item.order;
  }

  setItemOrder(item: PageInfoCustomProperty, order: string) {
    item.order = order;
  }

  getItemId(item: PageInfoCustomProperty) {
    return item.id;
  }

  get workspace() {
    return this.adapter.workspace;
  }

  get page() {
    return this.adapter.workspace.docCollection.getDoc(this.pageId);
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

  get properties() {
    return this.adapter.getPageProperties(this.pageId);
  }

  get readonly() {
    return !!this.page?.readonly;
  }

  /**
   * get custom properties (filter out properties that are not in schema)
   */
  getCustomProperties(): Record<string, PageInfoCustomProperty> {
    return this.properties
      ? Object.fromEntries(
          Object.entries(this.properties.custom).filter(([id]) =>
            this.metaManager.checkPropertyExists(id)
          )
        )
      : {};
  }

  getCustomPropertyMeta(id: string): PageInfoCustomPropertyMeta | undefined {
    return this.metaManager.customPropertiesSchema[id];
  }

  getCustomProperty(id: string) {
    return this.properties?.custom[id];
  }

  addCustomProperty(id: string, value?: any) {
    this.ensureRequiredProperties();
    if (!this.metaManager.checkPropertyExists(id)) {
      logger.warn(`property ${id} not found`);
      return;
    }

    if (!this.metaManager.validatePropertyValue(id, value)) {
      logger.warn(`property ${id} value ${value} is invalid`);
      return;
    }

    const newOrder = this.sorter.getNewItemOrder();
    if (this.properties!.custom[id]) {
      logger.warn(`custom property ${id} already exists`);
    }

    this.properties!.custom[id] = {
      id,
      value,
      order: newOrder,
      visibility: 'visible',
    };
  }

  hasCustomProperty(id: string) {
    return !!this.properties?.custom[id];
  }

  removeCustomProperty(id: string) {
    this.ensureRequiredProperties();
    delete this.properties!.custom[id];
  }

  updateCustomProperty(id: string, opt: Partial<PageInfoCustomProperty>) {
    this.ensureRequiredProperties();
    if (!this.properties?.custom[id]) {
      logger.warn(`custom property ${id} not found`);
      return;
    }
    if (
      opt.value !== undefined &&
      !this.metaManager.validatePropertyValue(id, opt.value)
    ) {
      logger.warn(`property ${id} value ${opt.value} is invalid`);
      return;
    }
    Object.assign(this.properties.custom[id], opt);
  }

  get updateCustomPropertyMeta() {
    return this.metaManager.updatePropertyMeta.bind(this.metaManager);
  }

  get isPropertyRequired() {
    return this.metaManager.isPropertyRequired.bind(this.metaManager);
  }

  transact = this.adapter.transact;
}
