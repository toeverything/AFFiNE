import { FlexWrapper, Input } from '@affine/component';
import { pushNotificationAtom } from '@affine/component/notification-center';
import {
  SettingHeader,
  SettingRow,
  StorageProgress,
} from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Button } from '@affine/component/ui/button';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useUserQuota } from '@affine/core/hooks/use-quota';
import {
  allBlobSizesQuery,
  removeAvatarMutation,
  SubscriptionPlan,
  updateUserProfileMutation,
  uploadAvatarMutation,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, CameraIcon } from '@blocksuite/icons';
import bytes from 'bytes';
import { useSetAtom } from 'jotai';
import {
  type FC,
  type MouseEvent,
  Suspense,
  useCallback,
  useMemo,
  useState,
} from 'react';

import {
  authAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '../../../../atoms';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { useServerFeatures } from '../../../../hooks/affine/use-server-config';
import { useMutation } from '../../../../hooks/use-mutation';
import { useQuery } from '../../../../hooks/use-query';
import { useUserSubscription } from '../../../../hooks/use-subscription';
import { validateAndReduceImage } from '../../../../utils/reduce-image';
import { Upload } from '../../../pure/file-upload';
import * as styles from './style.css';

export const UserAvatar = () => {
  const t = useAFFiNEI18N();
  const user = useCurrentUser();
  const pushNotification = useSetAtom(pushNotificationAtom);

  const { trigger: avatarTrigger } = useMutation({
    mutation: uploadAvatarMutation,
  });
  const { trigger: removeAvatarTrigger } = useMutation({
    mutation: removeAvatarMutation,
  });

  const handleUpdateUserAvatar = useAsyncCallback(
    async (file: File) => {
      try {
        const reducedFile = await validateAndReduceImage(file);
        const data = await avatarTrigger({
          avatar: reducedFile, // Pass the reducedFile directly to the avatarTrigger
        });
        user.update({ avatarUrl: data.uploadAvatar.avatarUrl });
        pushNotification({
          title: 'Update user avatar success',
          type: 'success',
        });
      } catch (e) {
        pushNotification({
          title: 'Update user avatar failed',
          message: String(e),
          type: 'error',
        });
      }
    },
    [avatarTrigger, pushNotification, user]
  );

  const handleRemoveUserAvatar = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await removeAvatarTrigger();
      user.update({ avatarUrl: null });
    },
    [removeAvatarTrigger, user]
  );

  return (
    <Upload
      accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
      fileChange={handleUpdateUserAvatar}
      data-testid="upload-user-avatar"
    >
      <Avatar
        size={56}
        name={user.name}
        url={user.avatarUrl}
        hoverIcon={<CameraIcon />}
        onRemove={user.avatarUrl ? handleRemoveUserAvatar : undefined}
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
  const t = useAFFiNEI18N();
  const user = useCurrentUser();
  const [input, setInput] = useState<string>(user.name);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const { trigger: updateProfile } = useMutation({
    mutation: updateUserProfileMutation,
  });
  const allowUpdate = !!input && input !== user.name;
  const handleUpdateUserName = useAsyncCallback(async () => {
    if (!allowUpdate) {
      return;
    }

    try {
      const data = await updateProfile({
        input: { name: input },
      });
      user.update({ name: data.updateProfile.name });
    } catch (e) {
      pushNotification({
        title: 'Failed to update user name.',
        message: String(e),
        type: 'error',
      });
    }
  }, [allowUpdate, input, user, updateProfile, pushNotification]);

  return (
    <SettingRow
      name={t['com.affine.settings.profile']()}
      desc={t['com.affine.settings.profile.message']()}
      spreadCol={false}
    >
      <FlexWrapper style={{ margin: '12px 0 24px 0' }} alignItems="center">
        <Suspense>
          <UserAvatar />
        </Suspense>

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
                className={styles.button}
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

const StoragePanel = () => {
  const t = useAFFiNEI18N();
  const { payment: hasPaymentFeature } = useServerFeatures();

  const { data } = useQuery({
    query: allBlobSizesQuery,
  });

  const [subscription] = useUserSubscription();
  const plan = subscription?.plan ?? SubscriptionPlan.Free;

  const quota = useUserQuota();
  const maxLimit = useMemo(() => {
    if (quota) {
      return quota.storageQuota;
    }
    return bytes.parse(plan === SubscriptionPlan.Free ? '10GB' : '100GB');
  }, [plan, quota]);

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const onUpgrade = useCallback(() => {
    setSettingModalAtom({
      open: true,
      activeTab: 'plans',
    });
  }, [setSettingModalAtom]);

  return (
    <SettingRow
      name={t['com.affine.storage.title']()}
      desc=""
      spreadCol={false}
    >
      <StorageProgress
        max={maxLimit}
        plan={plan}
        value={data.collectAllBlobSizes.size}
        onUpgrade={onUpgrade}
        upgradable={hasPaymentFeature}
      />
    </SettingRow>
  );
};

export const AccountSetting: FC = () => {
  const t = useAFFiNEI18N();
  const user = useCurrentUser();
  const setAuthModal = useSetAtom(authAtom);
  const setSignOutModal = useSetAtom(openSignOutModalAtom);

  const onChangeEmail = useCallback(() => {
    setAuthModal({
      openModal: true,
      state: 'sendEmail',
      email: user.email,
      emailType: user.emailVerified ? 'changeEmail' : 'verifyEmail',
    });
  }, [setAuthModal, user.email, user.emailVerified]);

  const onPasswordButtonClick = useCallback(() => {
    setAuthModal({
      openModal: true,
      state: 'sendEmail',
      email: user.email,
      emailType: user.hasPassword ? 'changePassword' : 'setPassword',
    });
  }, [setAuthModal, user.email, user.hasPassword]);

  const onOpenSignOutModal = useCallback(() => {
    setSignOutModal(true);
  }, [setSignOutModal]);

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.account']()}
        subtitle={t['com.affine.setting.account.message']()}
        data-testid="account-title"
      />
      <AvatarAndName />
      <SettingRow name={t['com.affine.settings.email']()} desc={user.email}>
        <Button onClick={onChangeEmail} className={styles.button}>
          {user.emailVerified
            ? t['com.affine.settings.email.action.change']()
            : t['com.affine.settings.email.action.verify']()}
        </Button>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.password']()}
        desc={t['com.affine.settings.password.message']()}
      >
        <Button onClick={onPasswordButtonClick} className={styles.button}>
          {user.hasPassword
            ? t['com.affine.settings.password.action.change']()
            : t['com.affine.settings.password.action.set']()}
        </Button>
      </SettingRow>
      <Suspense>
        <StoragePanel />
      </Suspense>
      <SettingRow
        name={t[`Sign out`]()}
        desc={t['com.affine.setting.sign.out.message']()}
        style={{ cursor: 'pointer' }}
        data-testid="sign-out-button"
        onClick={onOpenSignOutModal}
      >
        <ArrowRightSmallIcon />
      </SettingRow>
      {/*<SettingRow*/}
      {/*  name={*/}
      {/*    <span style={{ color: 'var(--affine-warning-color)' }}>*/}
      {/*      {t['com.affine.setting.account.delete']()}*/}
      {/*    </span>*/}
      {/*  }*/}
      {/*  desc={t['com.affine.setting.account.delete.message']()}*/}
      {/*  style={{ cursor: 'pointer' }}*/}
      {/*  onClick={useCallback(() => {*/}
      {/*    toast('Function coming soon');*/}
      {/*  }, [])}*/}
      {/*  testId="delete-account-button"*/}
      {/*>*/}
      {/*  <ArrowRightSmallIcon />*/}
      {/*</SettingRow>*/}
    </>
  );
};
