import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { DocCustomPropertyInfo } from '../../db/schema/schema';
import type { DocPropertiesStore } from '../stores/doc-properties';

export class DocPropertyList extends Entity {
  constructor(private readonly docPropertiesStore: DocPropertiesStore) {
    super();
  }

  properties$ = LiveData.from(
    this.docPropertiesStore.watchDocPropertyInfoList(),
    []
  );

  updatePropertyInfo(id: string, properties: Partial<DocCustomPropertyInfo>) {
    this.docPropertiesStore.updateDocPropertyInfo(id, properties);
  }

  createProperty(properties: DocCustomPropertyInfo) {
    return this.docPropertiesStore.createDocPropertyInfo(properties);
  }

  removeProperty(id: string) {
    this.docPropertiesStore.removeDocPropertyInfo(id);
  }
}
