import { notify, Switch } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import {
  type UserSettings,
  UserSettingsService,
} from '@affine/core/modules/cloud';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './style.css';

export const NotificationSettings = () => {
  const t = useI18n();
  const userSettingsService = useService(UserSettingsService);

  useEffect(() => {
    userSettingsService.revalidate();
  }, [userSettingsService]);

  const userSettings = useLiveData(userSettingsService.userSettings$);
  const [isMutating, setIsMutating] = useState(false);
  const error = useLiveData(userSettingsService.error$);
  const errorMessage = useMemo(() => {
    if (error) {
      const userFriendlyError = UserFriendlyError.fromAny(error);
      return t[`error.${userFriendlyError.name}`](userFriendlyError.data);
    }
    return null;
  }, [error, t]);

  const disable = !userSettings || isMutating;

  const handleUpdate = useCallback(
    (key: keyof UserSettings, value: boolean) => {
      setIsMutating(true);
      userSettingsService
        .updateUserSettings({
          [key]: value,
        })
        .catch(err => {
          const userFriendlyError = UserFriendlyError.fromAny(err);
          notify.error({
            title: t[`error.${userFriendlyError.name}`](userFriendlyError.data),
          });
        })
        .finally(() => {
          setIsMutating(false);
        });
    },
    [userSettingsService, t]
  );

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.notifications.header.title']()}
        subtitle={t['com.affine.setting.notifications.header.description']()}
      />
      <SettingWrapper
        title={t['com.affine.setting.notifications.email.title']()}
      >
        {!userSettings && errorMessage && (
          <>
            <div className={styles.errorMessage}>{errorMessage}</div>
            <br />
          </>
        )}
        <SettingRow
          name={t['com.affine.setting.notifications.email.mention.title']()}
          desc={t['com.affine.setting.notifications.email.mention.subtitle']()}
        >
          <Switch
            data-testid="notification-email-mention-trigger"
            checked={userSettings?.receiveMentionEmail ?? false}
            disabled={disable}
            onChange={checked => handleUpdate('receiveMentionEmail', checked)}
          />
        </SettingRow>
        <SettingRow
          name={t['com.affine.setting.notifications.email.invites.title']()}
          desc={t['com.affine.setting.notifications.email.invites.subtitle']()}
        >
          <Switch
            data-testid="notification-email-invites-trigger"
            checked={userSettings?.receiveInvitationEmail ?? false}
            disabled={disable}
            onChange={checked =>
              handleUpdate('receiveInvitationEmail', checked)
            }
          />
        </SettingRow>
        <SettingRow
          name={t['com.affine.setting.notifications.email.comments.title']()}
          desc={t['com.affine.setting.notifications.email.comments.subtitle']()}
        >
          <Switch
            data-testid="notification-email-comments-trigger"
            checked={userSettings?.receiveCommentEmail ?? false}
            disabled={disable}
            onChange={checked => handleUpdate('receiveCommentEmail', checked)}
          />
        </SettingRow>
      </SettingWrapper>
    </>
  );
};
