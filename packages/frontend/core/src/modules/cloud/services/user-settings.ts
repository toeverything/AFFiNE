import {
  effect,
  exhaustMapWithTrailing,
  fromPromise,
  LiveData,
  onComplete,
  onStart,
  Service,
  smartRetry,
} from '@toeverything/infra';
import { catchError, EMPTY, tap } from 'rxjs';

import type {
  UpdateUserSettingsInput,
  UserSettings,
  UserSettingsStore,
} from '../stores/user-settings';

export type { UserSettings };

export class UserSettingsService extends Service {
  constructor(private readonly store: UserSettingsStore) {
    super();
  }

  userSettings$ = new LiveData<UserSettings | undefined>(undefined);
  isLoading$ = new LiveData<boolean>(false);
  error$ = new LiveData<any | undefined>(undefined);

  revalidate = effect(
    exhaustMapWithTrailing(() => {
      return fromPromise(() => {
        return this.store.getUserSettings();
      }).pipe(
        smartRetry(),
        tap(settings => {
          this.userSettings$.value = settings;
        }),
        catchError(error => {
          this.error$.value = error;
          return EMPTY;
        }),
        onStart(() => {
          this.isLoading$.value = true;
        }),
        onComplete(() => {
          this.isLoading$.value = false;
        })
      );
    })
  );

  async updateUserSettings(settings: UpdateUserSettingsInput) {
    await this.store.updateUserSettings(settings);
    this.userSettings$.value = {
      ...this.userSettings$.value,
      ...(settings as UserSettings),
    };
    this.revalidate();
  }
}
