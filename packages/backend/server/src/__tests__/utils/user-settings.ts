import type {
  UpdateUserSettingsInput,
  UserSettingsType,
} from '../../core/user/types';
import type { TestingApp } from './testing-app';

export async function getUserSettings(
  app: TestingApp
): Promise<UserSettingsType> {
  const res = await app.gql(
    `
    query settings {
      currentUser {
        settings {
          receiveInvitationEmail
          receiveMentionEmail
          receiveCommentEmail
        }
      }
    }
    `
  );
  return res.currentUser.settings;
}

export async function updateUserSettings(
  app: TestingApp,
  input: UpdateUserSettingsInput
): Promise<boolean> {
  const res = await app.gql(
    `
    mutation updateUserSettings($input: UpdateUserSettingsInput!) {
      updateSettings(input: $input)
    }
    `,
    { input }
  );
  return res.updateSettings;
}
