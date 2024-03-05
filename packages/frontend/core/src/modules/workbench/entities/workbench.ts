import { Unreachable } from '@affine/env/constant';
import { LiveData } from '@toeverything/infra';
import type { To } from 'history';
import { combineLatest, map, switchMap } from 'rxjs';

import { View } from './view';

export type WorkbenchPosition = 'beside' | 'active' | number;

export class Workbench {
  readonly views = new LiveData([new View()]);

  activeViewIndex = new LiveData(0);
  activeView = LiveData.from(
    combineLatest([this.views, this.activeViewIndex]).pipe(
      map(([views, index]) => views[index])
    ),
    this.views.value[this.activeViewIndex.value]
  );

  location = LiveData.from(
    this.activeView.pipe(switchMap(view => view.location)),
    this.views.value[this.activeViewIndex.value].history.location
  );

  active(index: number) {
    this.activeViewIndex.next(index);
  }

  createView(at: WorkbenchPosition = 'beside', defaultLocation: To) {
    const view = new View(defaultLocation);
    const newViews = [...this.views.value];
    newViews.splice(this.indexAt(at), 0, view);
    this.views.next(newViews);
    return newViews.indexOf(view);
  }

  open(
    to: To,
    {
      at = 'active',
      replaceHistory = false,
    }: { at?: WorkbenchPosition; replaceHistory?: boolean } = {}
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

  openPage(pageId: string) {
    this.open(`/${pageId}`);
  }

  openCollections() {
    this.open('/collection');
  }

  openCollection(collectionId: string) {
    this.open(`/collection/${collectionId}`);
  }

  openAll() {
    this.open('/all');
  }

  openTrash() {
    this.open('/trash');
  }

  openTags() {
    this.open('/tag');
  }

  openTag(tagId: string) {
    this.open(`/tag/${tagId}`);
  }

  viewAt(positionIndex: WorkbenchPosition): View | undefined {
    return this.views.value[this.indexAt(positionIndex)];
  }

  close(view: View) {
    if (this.views.value.length === 1) return;
    const index = this.views.value.indexOf(view);
    if (index === -1) return;
    const newViews = [...this.views.value];
    newViews.splice(index, 1);
    this.views.next(newViews);
  }

  closeOthers(view: View) {
    view.size.next(100);
    this.views.next([view]);
  }

  moveView(from: number, to: number) {
    const views = [...this.views.value];
    const [removed] = views.splice(from, 1);
    views.splice(to, 0, removed);
    this.views.next(views);
    this.active(to);
  }

  /**
   * resize specified view and the next view
   * @param view
   * @param percent from 0 to 1
   * @returns
   */
  resize(index: number, percent: number) {
    const view = this.views.value[index];
    const nextView = this.views.value[index + 1];
    if (!nextView) return;

    const totalViewSize = this.views.value.reduce(
      (sum, v) => sum + v.size.value,
      0
    );
    const percentOfTotal = totalViewSize * percent;
    view.setSize(Number((view.size.value + percentOfTotal).toFixed(4)));
    nextView.setSize(Number((nextView.size.value - percentOfTotal).toFixed(4)));
  }

  private indexAt(positionIndex: WorkbenchPosition): number {
    if (positionIndex === 'active') {
      return this.activeViewIndex.value;
    }
    if (positionIndex === 'beside') {
      return this.activeViewIndex.value + 1;
    }
    return positionIndex;
  }
}
