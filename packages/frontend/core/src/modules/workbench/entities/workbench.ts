import type { WorkbenchViewMeta } from '@affine/electron-api';
import { Unreachable } from '@affine/env/constant';
import { Entity, LiveData } from '@toeverything/infra';
import type { Path, To } from 'history';
import { nanoid } from 'nanoid';
import { map } from 'rxjs';

import type { WorkbenchStateProvider } from '../services/workbench-view-state';
import { View } from './view';

export type WorkbenchPosition = 'beside' | 'active' | 'head' | 'tail' | number;

interface WorkbenchOpenOptions {
  at?: WorkbenchPosition;
  replaceHistory?: boolean;
}

function comparePath(a?: Partial<Path>, b?: Partial<Path>) {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pathname === b.pathname && a.search === b.search && a.hash === b.hash
  );
}

export class Workbench extends Entity {
  constructor(private readonly state: WorkbenchStateProvider) {
    super();
  }

  pushViewsUpdate() {
    const views = this.views$.value;
    const oldViewMetas = this.state.views$.value;
    this.state.views$.next(
      views.map(view => {
        const matched = oldViewMetas.find(v => v.id === view.id);
        return {
          ...matched,
          id: view.id,
          path: view.location$.value,
        };
      })
    );
  }

  readonly views$: LiveData<View[]> = LiveData.from(
    this.state.views$.pipe(
      map(viewMetas => {
        // reuse views when possible
        const oldViews = this.views$.value;
        const views = viewMetas.map(viewMeta => {
          // is old view
          let view = oldViews?.find(v => v.id === viewMeta.id);
          // check if view location changed
          if (view) {
            if (
              viewMeta.path &&
              view.location$.value &&
              !comparePath(view.location$.value, viewMeta.path)
            ) {
              // side effect in map???
              view.history.replace(viewMeta.path);
            }
          } else {
            view = this.framework.createEntity(View, {
              id: viewMeta.id,
              defaultLocation: viewMeta.path,
            });
          }
          return view;
        });
        return views;
      })
    ),
    []
  );
  readonly activeViewIndex$ = this.state.activeViewIndex$;
  readonly basename$ = this.state.basename$;

  DEFAULT_VIEW = this.framework.createEntity(View, {
    id: nanoid(),
  });

  activeView$ = LiveData.computed(get => {
    const activeIndex = get(this.activeViewIndex$);
    const views = get(this.views$);
    return views.at(activeIndex) ?? this.DEFAULT_VIEW;
  });
  location$ = LiveData.computed(get => {
    return get(get(this.activeView$).location$);
  });
  sidebarOpen$ = new LiveData(false);

  active(index: number) {
    index = Math.max(0, Math.min(index, this.views$.value.length - 1));
    this.activeViewIndex$.next(index);
  }

  createView(
    at: WorkbenchPosition = 'beside',
    defaultLocation: To,
    id = nanoid()
  ) {
    const newMeta: WorkbenchViewMeta = {
      id,
      path:
        typeof defaultLocation === 'string'
          ? { pathname: defaultLocation }
          : {
              pathname: defaultLocation.pathname ?? '/all',
              search: defaultLocation.search,
              hash: defaultLocation.hash,
            },
    };
    const newViews = [...this.state.views$.value];
    newViews.splice(this.indexAt(at), 0, newMeta);
    this.state.views$.next(newViews);
    const index = newViews.indexOf(newMeta);
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
    const newViews = [...this.state.views$.value];
    newViews.splice(index, 1);
    const activeViewIndex = this.activeViewIndex$.value;
    if (activeViewIndex !== 0 && activeViewIndex >= index) {
      this.active(activeViewIndex - 1);
    }
    this.state.views$.next(newViews);
  }

  closeOthers(view: View) {
    view.size$.next(100);
    this.state.views$.next(
      this.state.views$.value.filter(v => v.id === view.id)
    );
    this.active(0);
  }

  moveView(from: number, to: number) {
    from = Math.max(0, Math.min(from, this.state.views$.value.length - 1));
    to = Math.max(0, Math.min(to, this.state.views$.value.length - 1));
    if (from === to) return;
    const views = [...this.state.views$.value];
    const fromView = views[from];
    const toView = views[to];
    views[to] = fromView;
    views[from] = toView;
    this.state.views$.next(views);
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
