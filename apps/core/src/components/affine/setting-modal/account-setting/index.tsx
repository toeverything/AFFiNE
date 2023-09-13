import { FlexWrapper, Input } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
  StorageProgress,
} from '@affine/component/setting-components';
import {
  allBlobSizesQuery,
  removeAvatarMutation,
  uploadAvatarMutation,
} from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { ArrowRightSmallIcon, CameraIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Button } from '@toeverything/components/button';
import { useSetAtom } from 'jotai';
import {
  type FC,
  type MouseEvent,
  Suspense,
  useCallback,
  useState,
} from 'react';

import { authAtom } from '../../../../atoms';
import { useCurrentUser } from '../../../../hooks/affine/use-current-user';
import { useNavigateHelper } from '../../../../hooks/use-navigate-helper';
import { signOutCloud } from '../../../../utils/cloud-utils';
import { Upload } from '../../../pure/file-upload';
import * as style from './style.css';

export const UserAvatar = () => {
  const t = useAFFiNEI18N();
  const user = useCurrentUser();

  const { trigger: avatarTrigger } = useMutation({
    mutation: uploadAvatarMutation,
  });
  const { trigger: removeAvatarTrigger } = useMutation({
    mutation: removeAvatarMutation,
  });

  const handleUpdateUserAvatar = useCallback(
    async (file: File) => {
      await avatarTrigger({
        id: user.id,
        avatar: file,
      });
      // XXX: This is a hack to force the user to update, since next-auth can not only use update function without params
      user.update({ name: user.name }).catch(console.error);
    },
    [avatarTrigger, user]
  );
  const handleRemoveUserAvatar = useCallback(
    async (e: MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      await removeAvatarTrigger({
        id: user.id,
      });
      // XXX: This is a hack to force the user to update, since next-auth can not only use update function without params
      user.update({ name: user.name }).catch(console.error);
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
        url={user.image}
        hoverIcon={<CameraIcon />}
        onRemove={user.image ? handleRemoveUserAvatar : undefined}
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

  const handleUpdateUserName = useCallback(
    (newName: string) => {
      user.update({ name: newName }).catch(console.error);
    },
    [user]
  );

  return (
    <>
      <SettingRow
        name={t['com.affine.settings.profile']()}
        desc={t['com.affine.settings.profile.message']()}
        spreadCol={false}
      >
        <FlexWrapper style={{ margin: '12px 0 24px 0' }} alignItems="center">
          <Suspense>
            <UserAvatar />
          </Suspense>

          <div className={style.profileInputWrapper}>
            <label>{t['com.affine.settings.profile.name']()}</label>
            <FlexWrapper alignItems="center">
              <Input
                defaultValue={input}
                data-testid="user-name-input"
                placeholder={t['com.affine.settings.profile.placeholder']()}
                maxLength={64}
                minLength={0}
                width={280}
                height={28}
                onChange={setInput}
              />
              {input && input === user.name ? null : (
                <Button
                  data-testid="save-user-name"
                  onClick={() => {
                    handleUpdateUserName(input);
                  }}
                  style={{
                    marginLeft: '12px',
                  }}
                >
                  {t['com.affine.editCollection.save']()}
                </Button>
              )}
            </FlexWrapper>
          </div>
        </FlexWrapper>
      </SettingRow>
    </>
  );
};

const StoragePanel = () => {
  const t = useAFFiNEI18N();

  const { data } = useQuery({
    query: allBlobSizesQuery,
  });

  const onUpgrade = useCallback(() => {}, []);

  return (
    <SettingRow
      name={t['com.affine.storage.title']()}
      desc=""
      spreadCol={false}
    >
      <StorageProgress
        max={10737418240}
        value={data.collectAllBlobSizes.size}
        onUpgrade={onUpgrade}
      />
    </SettingRow>
  );
};

export const AccountSetting: FC = () => {
  const t = useAFFiNEI18N();
  const user = useCurrentUser();
  const { jumpToIndex } = useNavigateHelper();
  const setAuthModal = useSetAtom(authAtom);

  const onChangeEmail = useCallback(() => {
    setAuthModal({
      openModal: true,
      state: 'sendEmail',
      email: user.email,
      emailType: 'changeEmail',
    });
  }, [setAuthModal, user.email]);

  const onPasswordButtonClick = useCallback(() => {
    setAuthModal({
      openModal: true,
      state: 'sendEmail',
      email: user.email,
      emailType: user.hasPassword ? 'changePassword' : 'setPassword',
    });
  }, [setAuthModal, user.email, user.hasPassword]);

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.account']()}
        subtitle={t['com.affine.setting.account.message']()}
        data-testid="account-title"
      />
      <AvatarAndName />
      <SettingRow name={t['com.affine.settings.email']()} desc={user.email}>
        <Button onClick={onChangeEmail}>
          {t['com.affine.settings.email.action']()}
        </Button>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.password']()}
        desc={t['com.affine.settings.password.message']()}
      >
        <Button onClick={onPasswordButtonClick}>
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
        onClick={useCallback(() => {
          signOutCloud()
            .then(() => {
              jumpToIndex();
            })
            .catch(console.error);
        }, [jumpToIndex])}
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
