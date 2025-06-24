import { toDocSearchParams } from '@affine/core/modules/navigation/utils';
import { Unreachable } from '@affine/env/constant';
import type { ReferenceParams } from '@blocksuite/affine/model';
import { Entity, LiveData } from '@toeverything/infra';
import { type To } from 'history';
import { omit } from 'lodash-es';
import { nanoid } from 'nanoid';

import type { GlobalState } from '../../storage';
import type { WorkbenchNewTabHandler } from '../services/workbench-new-tab-handler';
import type { WorkbenchDefaultState } from '../services/workbench-view-state';
import { View } from './view';

export type WorkbenchPosition = 'beside' | 'active' | 'head' | 'tail' | number;

export type WorkbenchOpenOptions = {
  at?: WorkbenchPosition | 'new-tab';
  replaceHistory?: boolean;
  show?: boolean; // only for new tab
};

const sidebarOpenKey = 'workbenchSidebarOpen';
const sidebarWidthKey = 'workbenchSidebarWidth';
const workspaceSelectorOpenKey = 'workspaceSelectorOpen';

export class Workbench extends Entity {
  constructor(
    private readonly defaultState: WorkbenchDefaultState,
    private readonly newTabHandler: WorkbenchNewTabHandler,
    private readonly globalState: GlobalState
  ) {
    super();
  }

  readonly activeViewIndex$ = new LiveData(this.defaultState.activeViewIndex);
  readonly basename$ = new LiveData(this.defaultState.basename);

  readonly views$: LiveData<View[]> = new LiveData(
    this.defaultState.views.map(meta => {
      return this.framework.createEntity(View, {
        id: meta.id,
        defaultLocation: meta.path,
        icon: meta.icon,
        title: meta.title,
      });
    })
  );

  activeView$ = LiveData.computed(get => {
    const activeIndex = get(this.activeViewIndex$);
    const views = get(this.views$);
    // activeIndex could be out of bounds when reordering views
    return views.at(activeIndex) || views[0];
  });

  location$ = LiveData.computed(get => {
    return get(get(this.activeView$).location$);
  });
  sidebarOpen$ = LiveData.from(
    this.globalState.watch<boolean>(sidebarOpenKey),
    this.globalState.get<boolean>(sidebarOpenKey) ?? false
  );
  setSidebarOpen(open: boolean) {
    this.globalState.set(sidebarOpenKey, open);
  }
  sidebarWidth$ = LiveData.from(
    this.globalState.watch<number>(sidebarWidthKey),
    this.globalState.get<number>(sidebarWidthKey) ?? 320
  );
  setSidebarWidth(width: number) {
    this.globalState.set(sidebarWidthKey, width);
  }

  workspaceSelectorOpen$ = LiveData.from(
    this.globalState.watch<boolean>(workspaceSelectorOpenKey),
    this.globalState.get<boolean>(workspaceSelectorOpenKey) ?? false
  );
  setWorkspaceSelectorOpen(open: boolean) {
    this.globalState.set(workspaceSelectorOpenKey, open);
  }

  active(index: number | View) {
    if (typeof index === 'number') {
      index = Math.max(0, Math.min(index, this.views$.value.length - 1));
      this.activeViewIndex$.next(index);
    } else {
      this.activeViewIndex$.next(this.views$.value.indexOf(index));
    }
  }

  updateBasename(basename: string) {
    this.basename$.next(basename);
  }

  createView(
    at: WorkbenchPosition = 'beside',
    defaultLocation: To,
    active = true
  ) {
    const view = this.framework.createEntity(View, {
      id: nanoid(),
      defaultLocation,
    });
    const newViews = [...this.views$.value];
    newViews.splice(this.indexAt(at), 0, view);
    this.views$.next(newViews);
    const index = newViews.indexOf(view);
    if (active) {
      this.active(index);
    }
    return index;
  }

  openSidebar() {
    this.setSidebarOpen(true);
  }

  closeSidebar() {
    this.setSidebarOpen(false);
  }

  toggleSidebar() {
    this.setSidebarOpen(!this.sidebarOpen$.value);
  }

  openWorkspaceSelector() {
    this.setWorkspaceSelectorOpen(true);
  }

  closeWorkspaceSelector() {
    this.setWorkspaceSelectorOpen(false);
  }

  toggleWorkspaceSelector() {
    this.setWorkspaceSelectorOpen(!this.workspaceSelectorOpen$.value);
  }

  open(to: To, option: WorkbenchOpenOptions = {}) {
    if (option.at === 'new-tab') {
      this.newTab(to, {
        show: option.show,
      });
    } else {
      const { at = 'active', replaceHistory = false } = option;
      let view = this.viewAt(at);
      if (!view) {
        const newIndex = this.createView(at, to, option.show);
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
  }

  newTab(
    to: To,
    {
      show,
    }: {
      show?: boolean;
    } = {}
  ) {
    this.newTabHandler.handle({
      basename: this.basename$.value,
      to,
      show: show ?? true,
    });
  }

  openDoc(
    id:
      | string
      | ({
          docId: string;
          refreshKey?: string;
          fromTab?: string;
        } & ReferenceParams),
    options?: WorkbenchOpenOptions
  ) {
    const isString = typeof id === 'string';
    const docId = isString ? id : id.docId;

    let query = '';
    if (!isString) {
      const search = toDocSearchParams(omit(id, ['docId']));
      if (search?.size) {
        query = `?${search.toString()}`;
      }
    }

    this.open(`/${docId}${query}`, options);
  }

  openAttachment(
    docId: string,
    blockId: string,
    options?: WorkbenchOpenOptions
  ) {
    this.open(`/${docId}/attachments/${blockId}`, options);
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
