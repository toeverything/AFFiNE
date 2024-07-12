import { Unreachable } from '@affine/env/constant';
import { Entity, LiveData } from '@toeverything/infra';
import type { To } from 'history';
import { nanoid } from 'nanoid';

import { View } from './view';

export type WorkbenchPosition = 'beside' | 'active' | 'head' | 'tail' | number;

interface WorkbenchOpenOptions {
  at?: WorkbenchPosition;
  replaceHistory?: boolean;
}

export class Workbench extends Entity {
  readonly views$ = new LiveData([
    this.framework.createEntity(View, { id: nanoid() }),
  ]);

  activeViewIndex$ = new LiveData(0);
  activeView$ = LiveData.computed(get => {
    const activeIndex = get(this.activeViewIndex$);
    const views = get(this.views$);
    return views[activeIndex];
  });
  basename$ = new LiveData('/');
  location$ = LiveData.computed(get => {
    return get(get(this.activeView$).location$);
  });
  sidebarOpen$ = new LiveData(false);

  active(index: number) {
    index = Math.max(0, Math.min(index, this.views$.value.length - 1));
    this.activeViewIndex$.next(index);
  }

  createView(at: WorkbenchPosition = 'beside', defaultLocation: To) {
    const view = this.framework.createEntity(View, {
      id: nanoid(),
      defaultLocation,
    });
    const newViews = [...this.views$.value];
    newViews.splice(this.indexAt(at), 0, view);
    this.views$.next(newViews);
    const index = newViews.indexOf(view);
    this.active(index);
    return index;
  }

  openSidebar() {
    this.sidebarOpen$.next(true);
  }

  closeSidebar() {
    this.sidebarOpen$.next(false);
  }

  toggleSidebar() {
    this.sidebarOpen$.next(!this.sidebarOpen$.value);
  }

  open(
    to: To,
    { at = 'active', replaceHistory = false }: WorkbenchOpenOptions = {}
  ) {
    let view = this.viewAt(at);
    if (!view) {
      const newIndex = this.createView(at, to);
      view = this.viewAt(newIndex);
      if (!view) {
        throw new Unreachable();
      }
    } else {
      if (replaceHistory) {
        view.history.replace(to);
      } else {
        view.history.push(to);
      }
    }
  }

  openDoc(
    id: string | { docId: string; blockId?: string },
    options?: WorkbenchOpenOptions
  ) {
    const docId = typeof id === 'string' ? id : id.docId;
    const blockId = typeof id === 'string' ? undefined : id.blockId;
    this.open(blockId ? `/${docId}#${blockId}` : `/${docId}`, options);
  }

  openCollections(options?: WorkbenchOpenOptions) {
    this.open('/collection', options);
  }

  openCollection(collectionId: string, options?: WorkbenchOpenOptions) {
    this.open(`/collection/${collectionId}`, options);
  }

  openAll(options?: WorkbenchOpenOptions) {
    this.open('/all', options);
  }

  openTrash(options?: WorkbenchOpenOptions) {
    this.open('/trash', options);
  }

  openTags(options?: WorkbenchOpenOptions) {
    this.open('/tag', options);
  }

  openTag(tagId: string, options?: WorkbenchOpenOptions) {
    this.open(`/tag/${tagId}`, options);
  }

  viewAt(positionIndex: WorkbenchPosition): View | undefined {
    return this.views$.value[this.indexAt(positionIndex)];
  }

  close(view: View) {
    if (this.views$.value.length === 1) return;
    const index = this.views$.value.indexOf(view);
    if (index === -1) return;
    const newViews = [...this.views$.value];
    newViews.splice(index, 1);
    const activeViewIndex = this.activeViewIndex$.value;
    if (activeViewIndex !== 0 && activeViewIndex >= index) {
      this.active(activeViewIndex - 1);
    }
    this.views$.next(newViews);
  }

  closeOthers(view: View) {
    view.size$.next(100);
    this.views$.next([view]);
    this.active(0);
  }

  moveView(from: number, to: number) {
    from = Math.max(0, Math.min(from, this.views$.value.length - 1));
    to = Math.max(0, Math.min(to, this.views$.value.length - 1));
    if (from === to) return;
    const views = [...this.views$.value];
    const fromView = views[from];
    const toView = views[to];
    views[to] = fromView;
    views[from] = toView;
    this.views$.next(views);
    this.active(to);
  }

  /**
   * resize specified view and the next view
   * @param view
   * @param percent from 0 to 1
   * @returns
   */
  resize(index: number, percent: number) {
    const view = this.views$.value[index];
    const nextView = this.views$.value[index + 1];
    if (!nextView) return;

    const totalViewSize = this.views$.value.reduce(
      (sum, v) => sum + v.size$.value,
      0
    );
    const percentOfTotal = totalViewSize * percent;
    const newSize = Number((view.size$.value + percentOfTotal).toFixed(4));
    const newNextSize = Number(
      (nextView.size$.value - percentOfTotal).toFixed(4)
    );
    // TODO(@catsjuice): better strategy to limit size
    if (newSize / totalViewSize < 0.2 || newNextSize / totalViewSize < 0.2)
      return;
    view.setSize(newSize);
    nextView.setSize(newNextSize);
  }

  private indexAt(positionIndex: WorkbenchPosition): number {
    if (positionIndex === 'active') {
      return this.activeViewIndex$.value;
    }
    if (positionIndex === 'beside') {
      return this.activeViewIndex$.value + 1;
    }
    if (positionIndex === 'head') {
      return 0;
    }
    if (positionIndex === 'tail') {
      return this.views$.value.length;
    }
    return positionIndex;
  }
}
