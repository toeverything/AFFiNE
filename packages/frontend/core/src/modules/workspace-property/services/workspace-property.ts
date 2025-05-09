import {
  generateFractionalIndexingKeyBetween,
  LiveData,
  Service,
} from '@toeverything/infra';

import type { DocCustomPropertyInfo } from '../../db/schema/schema';
import type { WorkspacePropertyStore } from '../stores/workspace-property';

export class WorkspacePropertyService extends Service {
  constructor(
    private readonly workspacePropertiesStore: WorkspacePropertyStore
  ) {
    super();
  }

  properties$ = LiveData.from(
    this.workspacePropertiesStore.watchWorkspaceProperties(),
    []
  );

  sortedProperties$ = this.properties$.map(list =>
    // default index key is '', so always before any others
    list.toSorted((a, b) => ((a.index ?? '') > (b.index ?? '') ? 1 : -1))
  );

  propertyInfo$(id: string) {
    return this.properties$.map(list => list.find(info => info.id === id));
  }

  updatePropertyInfo(id: string, properties: Partial<DocCustomPropertyInfo>) {
    this.workspacePropertiesStore.updateWorkspaceProperty(id, properties);
  }

  createProperty(
    properties: Omit<DocCustomPropertyInfo, 'id'> & { id?: string }
  ) {
    return this.workspacePropertiesStore.createWorkspaceProperty(properties);
  }

  removeProperty(id: string) {
    this.workspacePropertiesStore.removeWorkspaceProperty(id);
  }

  indexAt(at: 'before' | 'after', targetId?: string) {
    const sortedChildren = this.sortedProperties$.value.filter(
      node => node.index
    ) as (DocCustomPropertyInfo & { index: string })[];
    const targetIndex = targetId
      ? sortedChildren.findIndex(node => node.id === targetId)
      : -1;
    if (targetIndex === -1) {
      if (at === 'before') {
        const first = sortedChildren.at(0);
        return generateFractionalIndexingKeyBetween(null, first?.index ?? null);
      } else {
        const last = sortedChildren.at(-1);
        return generateFractionalIndexingKeyBetween(last?.index ?? null, null);
      }
    } else {
      const target = sortedChildren[targetIndex];
      const before: DocCustomPropertyInfo | null =
        sortedChildren[targetIndex - 1] || null;
      const after: DocCustomPropertyInfo | null =
        sortedChildren[targetIndex + 1] || null;
      if (at === 'before') {
        return generateFractionalIndexingKeyBetween(
          before?.index ?? null,
          target.index
        );
      } else {
        return generateFractionalIndexingKeyBetween(
          target.index,
          after?.index ?? null
        );
      }
    }
  }
}
