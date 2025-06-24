import { LiveData, Store } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { exhaustMap, map } from 'rxjs';

import { AuthService, type WorkspaceServerService } from '../../cloud';
import type { CacheStorage, GlobalState } from '../../storage';
import type { WorkspaceService } from '../../workspace';

export interface CalendarSubscriptionConfig {
  color: string;
  name?: string;
  showEvents?: boolean;
  showAllDayEvents?: boolean;
}
type CalendarSubscriptionStore = Record<string, CalendarSubscriptionConfig>;

export class CalendarStore extends Store {
  constructor(
    private readonly globalState: GlobalState,
    private readonly cacheStorage: CacheStorage,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  public colors = [
    cssVarV2.calendar.red,
    cssVarV2.calendar.orange,
    cssVarV2.calendar.yellow,
    cssVarV2.calendar.green,
    cssVarV2.calendar.teal,
    cssVarV2.calendar.blue,
    cssVarV2.calendar.purple,
    cssVarV2.calendar.magenta,
    cssVarV2.calendar.grey,
  ];

  public getRandomColor() {
    return this.colors[Math.floor(Math.random() * this.colors.length)];
  }

  private _getKey(userId: string, workspaceId: string) {
    return `calendar:${userId}:${workspaceId}:subscriptions`;
  }

  private _createSubscription() {
    return {
      showEvents: true,
      showAllDayEvents: true,
      color: this.getRandomColor(),
    };
  }

  authService = this.workspaceServerService.server?.scope.get(AuthService);
  userId$ =
    this.workspaceService.workspace.meta.flavour === 'local' ||
    !this.authService
      ? new LiveData('__local__')
      : this.authService.session.account$.map(
          account => account?.id ?? '__local__'
        );
  storageKey$() {
    const workspaceId = this.workspaceService.workspace.id;
    return this.userId$.map(userId => this._getKey(userId, workspaceId));
  }
  getUserId() {
    return this.workspaceService.workspace.meta.flavour === 'local' ||
      !this.authService
      ? '__local__'
      : (this.authService.session.account$.value?.id ?? '__local__');
  }

  getStorageKey() {
    const workspaceId = this.workspaceService.workspace.id;
    return this._getKey(this.getUserId(), workspaceId);
  }

  getCacheKey(url: string) {
    return `calendar-cache:${url}`;
  }

  watchSubscriptionMap() {
    return this.storageKey$().pipe(
      exhaustMap(storageKey => {
        return this.globalState.watch<CalendarSubscriptionStore>(storageKey);
      })
    );
  }

  watchSubscription(url: string) {
    return this.watchSubscriptionMap().pipe(
      map(subscriptionMap => {
        if (!subscriptionMap) {
          return null;
        }
        return subscriptionMap[url] ?? null;
      })
    );
  }

  getSubscription(url: string) {
    return this.getSubscriptionMap()[url];
  }

  watchSubscriptionCache(url: string) {
    return this.cacheStorage.watch<string>(this.getCacheKey(url));
  }

  getSubscriptionMap() {
    return (
      this.globalState.get<CalendarSubscriptionStore | undefined>(
        this.getStorageKey()
      ) ?? {}
    );
  }

  addSubscription(url: string, config?: Partial<CalendarSubscriptionConfig>) {
    const subscriptionMap = this.getSubscriptionMap();
    this.globalState.set(this.getStorageKey(), {
      ...subscriptionMap,
      [url]: {
        // merge default config
        ...this._createSubscription(),
        // update if exists
        ...subscriptionMap[url],
        ...config,
      },
    });
  }

  removeSubscription(url: string) {
    this.globalState.set(
      this.getStorageKey(),
      Object.fromEntries(
        Object.entries(this.getSubscriptionMap()).filter(([key]) => key !== url)
      )
    );
  }

  updateSubscription(
    url: string,
    updates: Partial<Omit<CalendarSubscriptionConfig, 'url'>>
  ) {
    const subscriptionMap = this.getSubscriptionMap();
    this.globalState.set(this.getStorageKey(), {
      ...subscriptionMap,
      [url]: { ...subscriptionMap[url], ...updates },
    });
  }

  setSubscriptionCache(url: string, cache: string) {
    return this.cacheStorage.set(this.getCacheKey(url), cache);
  }
}
