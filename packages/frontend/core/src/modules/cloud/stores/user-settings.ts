import {
  type GetCurrentUserProfileQuery,
  getCurrentUserProfileQuery,
  type UpdateUserSettingsInput,
  updateUserSettingsMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export type UserSettings = NonNullable<
  GetCurrentUserProfileQuery['currentUser']
>['settings'];

export type { UpdateUserSettingsInput };

export class UserSettingsStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async getUserSettings(): Promise<UserSettings | undefined> {
    const result = await this.gqlService.gql({
      query: getCurrentUserProfileQuery,
    });
    return result.currentUser?.settings;
  }

  async updateUserSettings(settings: UpdateUserSettingsInput) {
    await this.gqlService.gql({
      query: updateUserSettingsMutation,
      variables: {
        input: settings,
      },
    });
  }
}
