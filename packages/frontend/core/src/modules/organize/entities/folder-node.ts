import {
  Entity,
  generateFractionalIndexingKeyBetween,
  LiveData,
} from '@toeverything/infra';
import { map, of, switchMap } from 'rxjs';

import type { FolderStore } from '../stores/folder';

export class FolderNode extends Entity<{
  id: string | null;
}> {
  id = this.props.id;

  info$ = LiveData.from<{
    data: string;
    // eslint-disable-next-line @typescript-eslint/ban-types
    type: (string & {}) | 'folder' | 'doc' | 'tag' | 'collection';
    index: string;
    id: string;
    parentId?: string | null;
  } | null>(this.store.watchNodeInfo(this.id ?? ''), null);
  type$ = this.info$.map(info =>
    this.id === null ? 'folder' : (info?.type ?? '')
  );
  data$ = this.info$.map(info => info?.data);
  name$ = this.info$.map(info => (info?.type === 'folder' ? info.data : ''));
  children$ = LiveData.from<FolderNode[]>(
    // watch children if this is a folder, otherwise return empty array
    this.type$.pipe(
      switchMap(type =>
        type === 'folder'
          ? this.store
              .watchNodeChildren(this.id)
              .pipe(
                map(children =>
                  children
                    .filter(e => this.filterInvalidChildren(e))
                    .map(child =>
                      this.framework.createEntity(FolderNode, child)
                    )
                )
              )
              .pipe()
          : of([])
      )
    ),
    []
  );
  sortedChildren$ = LiveData.computed(get => {
    return get(this.children$)
      .map(node => [node, get(node.index$)] as const)
      .sort((a, b) => (a[1] > b[1] ? 1 : -1))
      .map(([node]) => node);
  });
  index$ = this.info$.map(info => info?.index ?? '');

  constructor(readonly store: FolderStore) {
    super();
  }

  contains(childId: string | null): boolean {
    if (!this.id) {
      return true;
    }
    if (!childId) {
      return false;
    }
    return this.store.isAncestor(childId, this.id);
  }

  beChildOf(parentId: string | null): boolean {
    if (!this.id) {
      return false;
    }
    if (!parentId) {
      return true;
    }
    return this.store.isAncestor(this.id, parentId);
  }

  filterInvalidChildren(child: { type: string }): boolean {
    if (this.id === null && child.type !== 'folder') {
      return false; // root node can only have folders
    }
    return true;
  }

  createFolder(name: string, index: string) {
    if (this.type$.value !== 'folder') {
      throw new Error('Cannot create folder on non-folder node');
    }
    return this.store.createFolder(this.id, name, index);
  }

  createLink(
    type: 'doc' | 'tag' | 'collection',
    targetId: string,
    index: string
  ) {
    if (this.id === null) {
      throw new Error('Cannot create link on root node');
    }
    if (this.type$.value !== 'folder') {
      throw new Error('Cannot create link on non-folder node');
    }
    this.store.createLink(this.id, type, targetId, index);
  }

  delete() {
    if (this.id === null) {
      throw new Error('Cannot delete root node');
    }
    if (this.type$.value === 'folder') {
      this.store.removeFolder(this.id);
    } else {
      this.store.removeLink(this.id);
    }
  }

  moveHere(childId: string, index: string) {
    this.store.moveNode(childId, this.id, index);
  }

  rename(name: string) {
    if (this.id === null) {
      throw new Error('Cannot rename root node');
    }
    this.store.renameNode(this.id, name);
  }

  indexAt(at: 'before' | 'after', targetId?: string) {
    if (!targetId) {
      if (at === 'before') {
        const first = this.sortedChildren$.value.at(0);
        return generateFractionalIndexingKeyBetween(
          null,
          first?.index$.value || null
        );
      } else {
        const last = this.sortedChildren$.value.at(-1);
        return generateFractionalIndexingKeyBetween(
          last?.index$.value || null,
          null
        );
      }
    } else {
      const sortedChildren = this.sortedChildren$.value;
      const targetIndex = sortedChildren.findIndex(
        node => node.id === targetId
      );
      if (targetIndex === -1) {
        throw new Error('Target node not found');
      }
      const target = sortedChildren[targetIndex];
      const before: FolderNode | null = sortedChildren[targetIndex - 1] || null;
      const after: FolderNode | null = sortedChildren[targetIndex + 1] || null;
      if (at === 'before') {
        return generateFractionalIndexingKeyBetween(
          before?.index$.value || null,
          target.index$.value
        );
      } else {
        return generateFractionalIndexingKeyBetween(
          target.index$.value,
          after?.index$.value || null
        );
      }
    }
  }
}
