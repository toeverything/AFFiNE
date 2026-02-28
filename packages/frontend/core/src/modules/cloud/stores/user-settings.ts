import {
  type GetUserSettingsQuery,
  getUserSettingsQuery,
  type UpdateUserSettingsInput,
  updateUserSettingsMutation,
} from '@affine/graphql';
import { Store } from '@toeverything/infra';

import type { GraphQLService } from '../services/graphql';

export type UserSettings = NonNullable<
  GetUserSettingsQuery['currentUser']
>['settings'];

export type { UpdateUserSettingsInput };

export class UserSettingsStore extends Store {
  constructor(private readonly gqlService: GraphQLService) {
    super();
  }

  async getUserSettings(): Promise<UserSettings | undefined> {
    const result = await this.gqlService.gql({
      query: getUserSettingsQuery,
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
