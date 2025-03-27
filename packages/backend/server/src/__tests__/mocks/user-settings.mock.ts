import type { UserSettings } from '@prisma/client';
import { omit } from 'lodash-es';

import { UserSettingsInput } from '../../models';
import { Mocker } from './factory';

export type MockUserSettingsInput = UserSettingsInput & {
  userId: string;
};

export type MockedUserSettings = UserSettings;

export class MockUserSettings extends Mocker<
  MockUserSettingsInput,
  MockedUserSettings
> {
  override async create(input: MockUserSettingsInput) {
    return await this.db.userSettings.create({
      data: {
        userId: input.userId,
        payload: {
          ...omit(input, 'userId'),
        },
      },
    });
  }
}
