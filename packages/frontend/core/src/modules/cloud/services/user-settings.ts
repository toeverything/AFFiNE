import { LiveData, Service } from '@toeverything/infra';

import { RealtimeLiveQuery } from '../realtime/live-query';
import type {
  UpdateUserSettingsInput,
  UserSettings,
  UserSettingsStore,
} from '../stores/user-settings';

export type { UserSettings };

export class UserSettingsService extends Service {
  constructor(private readonly store: UserSettingsStore) {
    super();
    this.liveQuery.start();
  }

  userSettings$ = new LiveData<UserSettings | undefined>(undefined);
  isLoading$ = new LiveData<boolean>(false);
  error$ = new LiveData<any | undefined>(undefined);
  private readonly liveQuery = new RealtimeLiveQuery({
    request: signal => this.requestUserSettings(signal),
    subscribe: () => this.store.subscribeUserSettings(),
    applySnapshot: settings => {
      this.error$.value = undefined;
      this.userSettings$.value = settings;
    },
    applyEvent: () => 'revalidate' as const,
    onError: error => {
      this.error$.value = error;
    },
  });

  revalidate = () => {
    this.liveQuery.revalidate();
  };

  async updateUserSettings(settings: UpdateUserSettingsInput) {
    await this.store.updateUserSettings(settings);
    this.userSettings$.value = {
      ...this.userSettings$.value,
      ...(settings as UserSettings),
    };
    this.revalidate();
  }

  override dispose(): void {
    super.dispose();
    this.liveQuery.dispose();
  }

  private async requestUserSettings(signal: AbortSignal) {
    this.isLoading$.value = true;
    try {
      return await this.store.getUserSettings(signal);
    } finally {
      this.isLoading$.value = false;
    }
  }
}
