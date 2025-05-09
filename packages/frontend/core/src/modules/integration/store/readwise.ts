import { LiveData, Store } from '@toeverything/infra';
import { exhaustMap } from 'rxjs';

import { AuthService, type WorkspaceServerService } from '../../cloud';
import type { GlobalState } from '../../storage';
import type { WorkspaceService } from '../../workspace';
import { type ReadwiseConfig } from '../type';

export class ReadwiseStore extends Store {
  constructor(
    private readonly globalState: GlobalState,
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService
  ) {
    super();
  }

  private _getKey({
    userId,
    workspaceId,
  }: {
    userId: string;
    workspaceId: string;
  }) {
    return `readwise:${userId}:${workspaceId}`;
  }

  authService = this.workspaceServerService.server?.scope.get(AuthService);
  workspaceId = this.workspaceService.workspace.id;

  userId$ =
    this.workspaceService.workspace.meta.flavour === 'local' ||
    !this.authService
      ? new LiveData('__local__')
      : this.authService.session.account$.map(
          account => account?.id ?? '__local__'
        );

  getUserId() {
    return this.workspaceService.workspace.meta.flavour === 'local' ||
      !this.authService
      ? '__local__'
      : (this.authService.session.account$.value?.id ?? '__local__');
  }

  storageKey$() {
    const workspaceId = this.workspaceService.workspace.id;
    return this.userId$.map(userId => this._getKey({ userId, workspaceId }));
  }

  getStorageKey() {
    const userId = this.getUserId();
    const workspaceId = this.workspaceService.workspace.id;
    return this._getKey({ userId, workspaceId });
  }

  watchSetting() {
    return this.storageKey$().pipe(
      exhaustMap(storageKey => {
        return this.globalState.watch<ReadwiseConfig>(storageKey);
      })
    );
  }

  getSetting(): ReadwiseConfig | undefined;
  getSetting<Key extends keyof ReadwiseConfig>(
    key: Key
  ): ReadwiseConfig[Key] | undefined;
  getSetting(key?: keyof ReadwiseConfig) {
    const config = this.globalState.get<ReadwiseConfig>(this.getStorageKey());
    if (!key) return config;
    return config?.[key];
  }

  setSetting<Key extends keyof ReadwiseConfig>(
    key: Key,
    value: ReadwiseConfig[Key]
  ) {
    this.globalState.set(this.getStorageKey(), {
      ...this.getSetting(),
      [key]: value,
    });
  }

  setSettings(settings: Partial<ReadwiseConfig>) {
    this.globalState.set(this.getStorageKey(), {
      ...this.getSetting(),
      ...settings,
    });
  }
}
