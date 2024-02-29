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

  createView(at: WorkbenchPosition = 'beside') {
    const view = new View();
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
      const newIndex = this.createView(at);
      view = this.viewAt(newIndex);
      if (!view) {
        throw new Unreachable();
      }
    }
    if (replaceHistory) {
      view.history.replace(to);
    } else {
      view.history.push(to);
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
