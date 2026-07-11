import { FlexWrapper, Input, notify } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Button } from '@affine/component/ui/button';
import { useSignOut } from '@affine/core/components/hooks/affine/use-sign-out';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { Upload } from '@affine/core/components/pure/file-upload';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { ArrowRightSmallIcon, CameraIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import {
  AuthService,
  type DeviceAuthSession,
  ServerService,
} from '../../../../modules/cloud';
import type { SettingState } from '../types';
import { AIUsagePanel } from './ai-usage-panel';
import { DeleteAccount } from './delete-account';
import { IntegrationsPanel } from './integrations-panel';
import { StorageProgress } from './storage-progress';
import * as styles from './style.css';

export const UserAvatar = () => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);

  const handleUpdateUserAvatar = useAsyncCallback(
    async (file: File) => {
      try {
        track.$.settingsPanel.accountSettings.uploadAvatar();
        await session.uploadAvatar(file);
        notify.success({ title: 'Update user avatar success' });
      } catch (e) {
        // TODO(@catsjuice): i18n
        notify.error({
          title: 'Update user avatar failed',
          message: String(e),
        });
      }
    },
    [session]
  );

  const handleRemoveUserAvatar = useCatchEventCallback(async () => {
    track.$.settingsPanel.accountSettings.removeAvatar();
    await session.removeAvatar();
  }, [session]);

  return (
    <Upload
      accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
      fileChange={handleUpdateUserAvatar}
      data-testid="upload-user-avatar"
    >
      <Avatar
        size={56}
        name={account?.label}
        url={account?.avatar}
        hoverIcon={<CameraIcon />}
        onRemove={account?.avatar ? handleRemoveUserAvatar : undefined}
        avatarTooltipOptions={{ content: t['Click to replace photo']() }}
        removeTooltipOptions={{ content: t['Remove photo']() }}
        data-testid="user-setting-avatar"
        removeButtonProps={{
          ['data-testid' as string]: 'user-setting-remove-avatar-button',
        }}
      />
    </Upload>
  );
};

export const AvatarAndName = () => {
  const t = useI18n();
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  const [input, setInput] = useState<string>(account?.label ?? '');

  const allowUpdate = !!input && input !== account?.label;
  const handleUpdateUserName = useAsyncCallback(async () => {
    if (account === null) {
      return;
    }
    if (!allowUpdate) {
      return;
    }

    try {
      track.$.settingsPanel.accountSettings.updateUserName();
      await session.updateLabel(input);
    } catch (e) {
      notify.error({
        title: 'Failed to update user name.',
        message: String(e),
      });
    }
  }, [account, allowUpdate, session, input]);

  return (
    <SettingRow
      name={t['com.affine.settings.profile']()}
      desc={t['com.affine.settings.profile.message']()}
      spreadCol={false}
    >
      <FlexWrapper style={{ margin: '12px 0 24px 0' }} alignItems="center">
        <UserAvatar />

        <div className={styles.profileInputWrapper}>
          <label>{t['com.affine.settings.profile.name']()}</label>
          <FlexWrapper alignItems="center">
            <Input
              defaultValue={input}
              data-testid="user-name-input"
              placeholder={t['com.affine.settings.profile.placeholder']()}
              maxLength={64}
              minLength={0}
              style={{ width: 280, height: 32 }}
              onChange={setInput}
              onEnter={handleUpdateUserName}
            />
            {allowUpdate ? (
              <Button
                data-testid="save-user-name"
                onClick={handleUpdateUserName}
                style={{
                  marginLeft: '12px',
                }}
              >
                {t['com.affine.editCollection.save']()}
              </Button>
            ) : null}
          </FlexWrapper>
        </div>
      </FlexWrapper>
    </SettingRow>
  );
};

const StoragePanel = ({
  onChangeSettingState,
}: {
  onChangeSettingState?: (settingState: SettingState) => void;
}) => {
  const t = useI18n();

  const onUpgrade = useCallback(() => {
    track.$.settingsPanel.accountUsage.viewPlans({
      plan: SubscriptionPlan.Pro,
    });
    onChangeSettingState?.({
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [onChangeSettingState]);

  return (
    <SettingRow
      name={t['com.affine.storage.title']()}
      desc=""
      spreadCol={false}
    >
      <StorageProgress onUpgrade={onUpgrade} />
    </SettingRow>
  );
};

const DevicesPanel = () => {
  const t = useI18n();
  const auth = useService(AuthService);
  const [sessions, setSessions] = useState<DeviceAuthSession[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSessions(await auth.listDeviceSessions());
    } catch (error) {
      notify.error({
        title: t['com.affine.settings.devices.load-failed'](),
        message: String(error),
      });
    } finally {
      setLoading(false);
    }
  }, [auth, t]);

  useEffect(() => {
    reload().catch(error => {
      notify.error({
        title: t['com.affine.settings.devices.load-failed'](),
        message: String(error),
      });
    });
  }, [reload, t]);

  const revoke = useCallback(
    async (session: DeviceAuthSession) => {
      if (
        !window.confirm(
          t['com.affine.settings.devices.confirm']({
            device: session.deviceName ?? session.platform,
          })
        )
      ) {
        return;
      }
      try {
        await auth.revokeDeviceSession(session.id, session.current);
        if (!session.current) await reload();
      } catch (error) {
        notify.error({
          title: t['com.affine.settings.devices.sign-out-failed'](),
          message: String(error),
        });
      }
    },
    [auth, reload, t]
  );

  const revokeAll = useCallback(async () => {
    if (!window.confirm(t['com.affine.settings.devices.confirm-all']())) return;
    try {
      await auth.revokeAllDeviceSessions();
    } catch (error) {
      notify.error({
        title: t['com.affine.settings.devices.sign-out-all-failed'](),
        message: String(error),
      });
    }
  }, [auth, t]);

  return (
    <SettingRow
      name={t['com.affine.settings.devices.title']()}
      desc={t['com.affine.settings.devices.description']()}
      spreadCol={false}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <span>{t['com.affine.settings.devices.loading']()}</span>
        ) : null}
        {sessions.map(session => (
          <div
            key={session.id}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div style={{ flex: 1 }}>
              <div>
                {session.deviceName ?? session.platform}
                {session.current
                  ? ` (${t['com.affine.settings.devices.current']()})`
                  : ''}
              </div>
              <div>
                {session.platform}
                {session.appVersion ? ` · ${session.appVersion}` : ''}
                {` · ${t['com.affine.settings.devices.last-used']({ time: new Date(session.lastSeenAt).toLocaleString() })}`}
              </div>
            </div>
            <Button onClick={() => void revoke(session)}>
              {t['com.affine.settings.devices.sign-out']()}
            </Button>
          </div>
        ))}
        {sessions.length > 1 ? (
          <Button onClick={() => void revokeAll()}>
            {t['com.affine.settings.devices.sign-out-all']()}
          </Button>
        ) : null}
      </div>
    </SettingRow>
  );
};

export const AccountSetting = ({
  onChangeSettingState,
}: {
  onChangeSettingState?: (settingState: SettingState) => void;
}) => {
  const { authService, serverService, globalDialogService } = useServices({
    AuthService,
    ServerService,
    GlobalDialogService,
  });
  const serverFeatures = useLiveData(serverService.server.features$);
  const t = useI18n();
  const session = authService.session;
  useEffect(() => {
    session.revalidate();
  }, [session]);
  const account = useLiveData(session.account$);
  const openSignOutModal = useSignOut();

  const onChangeEmail = useCallback(() => {
    if (!account) {
      return;
    }
    globalDialogService.open('verify-email', {
      server: serverService.server.baseUrl,
      changeEmail: !!account.info?.emailVerified,
    });
  }, [account, globalDialogService, serverService.server.baseUrl]);

  const onPasswordButtonClick = useCallback(() => {
    globalDialogService.open('change-password', {
      hasPassword: account?.info?.authMethods?.password.bound,
      server: serverService.server.baseUrl,
    });
  }, [
    account?.info?.authMethods?.password.bound,
    globalDialogService,
    serverService.server.baseUrl,
  ]);

  if (!account) {
    return null;
  }
  const hasPassword = account.info?.authMethods?.password.bound;

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.account']()}
        subtitle={t['com.affine.setting.account.message']()}
        data-testid="account-title"
      />
      <AvatarAndName />
      <SettingWrapper>
        <SettingRow
          name={t['com.affine.settings.email']()}
          desc={account.email}
        >
          <Button onClick={onChangeEmail}>
            {account.info?.emailVerified
              ? t['com.affine.settings.email.action.change']()
              : t['com.affine.settings.email.action.verify']()}
          </Button>
        </SettingRow>
        <SettingRow
          name={t['com.affine.settings.password']()}
          desc={t['com.affine.settings.password.message']()}
        >
          <Button onClick={onPasswordButtonClick}>
            {hasPassword
              ? t['com.affine.settings.password.action.change']()
              : t['com.affine.settings.password.action.set']()}
          </Button>
        </SettingRow>
        <DevicesPanel />
        <StoragePanel onChangeSettingState={onChangeSettingState} />
        {serverFeatures?.copilot && (
          <AIUsagePanel onChangeSettingState={onChangeSettingState} />
        )}
        <IntegrationsPanel onChangeSettingState={onChangeSettingState} />
        <SettingRow
          name={t[`Sign out`]()}
          desc={t['com.affine.setting.sign.out.message']()}
          style={{ cursor: 'pointer' }}
          data-testid="sign-out-button"
          onClick={openSignOutModal}
        >
          <ArrowRightSmallIcon />
        </SettingRow>
      </SettingWrapper>
      <DeleteAccount />
    </>
  );
};
