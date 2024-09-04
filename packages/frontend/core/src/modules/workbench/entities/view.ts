import { Entity, LiveData } from '@toeverything/infra';
import type { Location, To } from 'history';
import { isEqual } from 'lodash-es';
import type { ParseOptions } from 'query-string';
import queryString from 'query-string';
import { Observable } from 'rxjs';

import { createNavigableHistory } from '../../../utils/navigable-history';
import type { ViewIconName } from '../constants';
import { ViewScope } from '../scopes/view';
import { SidebarTab } from './sidebar-tab';

export class View extends Entity<{
  id: string;
  defaultLocation?: To | undefined;
  title?: string;
  icon?: ViewIconName;
}> {
  scope = this.framework.createScope(ViewScope, {
    view: this as View,
  });

  get id() {
    return this.props.id;
  }

  set id(id: string) {
    this.props.id = id;
  }

  sidebarTabs$ = new LiveData<SidebarTab[]>([]);

  // _activeTabId may point to a non-existent tab.
  // In this case, we still retain the activeTabId data and wait for the non-existent tab to be mounted.
  _activeSidebarTabId$ = new LiveData<string | null>(null);
  activeSidebarTab$ = LiveData.computed(get => {
    const activeTabId = get(this._activeSidebarTabId$);
    const tabs = get(this.sidebarTabs$);
    return tabs.length > 0
      ? (tabs.find(tab => tab.id === activeTabId) ?? tabs[0])
      : null;
  });

  constructor() {
    super();
    this.history = createNavigableHistory({
      initialEntries: [this.props.defaultLocation ?? { pathname: '/all' }],
      initialIndex: 0,
    });
  }

  history = createNavigableHistory({
    initialEntries: ['/all'],
    initialIndex: 0,
  });

  location$ = LiveData.from<Location>(
    new Observable(subscriber => {
      subscriber.next(this.history.location);
      return this.history.listen(update => {
        subscriber.next(update.location);
      });
    }),
    this.history.location
  );

  entries$ = LiveData.from<Location[]>(
    new Observable(subscriber => {
      subscriber.next(this.history.entries);
      return this.history.listen(() => {
        subscriber.next(this.history.entries);
      });
    }),
    this.history.entries
  );

  size$ = new LiveData(100);

  title$ = new LiveData(this.props.title ?? '');

  icon$ = new LiveData(this.props.icon ?? 'allDocs');

  queryString$<T extends Record<string, unknown>>(
    options: ParseOptions = {
      parseNumbers: true,
      parseBooleans: true,
    }
  ) {
    return this.location$
      .selector(v => v.search)
      .map(search => queryString.parse(search, options) as Partial<T>);
  }

  updateQueryString<T extends Record<string, unknown>>(
    patch: Partial<T>,
    {
      forceUpdate,
      parseNumbers,
      replace,
    }: {
      forceUpdate?: boolean;
      parseNumbers?: boolean;
      replace?: boolean;
    } = {}
  ) {
    const oldQueryStrings = queryString.parse(location.search, {
      parseBooleans: true,
      parseNumbers: parseNumbers,
    });
    const newQueryStrings = { ...oldQueryStrings, ...patch };

    if (forceUpdate || !isEqual(oldQueryStrings, newQueryStrings)) {
      const search = queryString.stringify(newQueryStrings);

      const newState = {
        ...this.history.location,
        search,
      };

      if (replace) {
        this.history.replace(newState);
      } else {
        this.history.push(newState);
      }
    }
  }

  push(path: To) {
    this.history.push(path);
  }

  go(n: number) {
    this.history.go(n);
  }

  replace(path: To) {
    this.history.replace(path);
  }

  setSize(size?: number) {
    this.size$.next(size ?? 100);
  }

  addSidebarTab(id: string) {
    this.sidebarTabs$.next([
      ...this.sidebarTabs$.value,
      this.scope.createEntity(SidebarTab, {
        id,
      }),
    ]);
    return id;
  }

  removeSidebarTab(id: string) {
    this.sidebarTabs$.next(
      this.sidebarTabs$.value.filter(tab => tab.id !== id)
    );
  }

  activeSidebarTab(id: string | null) {
    this._activeSidebarTabId$.next(id);
  }

  setTitle(title: string) {
    this.title$.next(title);
  }

  setIcon(icon: ViewIconName) {
    this.icon$.next(icon);
  }
}
