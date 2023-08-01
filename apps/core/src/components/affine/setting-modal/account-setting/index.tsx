import { Button, FlexWrapper, IconButton, Input } from '@affine/component';
import {
  SettingHeader,
  SettingRow,
} from '@affine/component/setting-components';
import { UserAvatar } from '@affine/component/user-avatar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ArrowRightSmallIcon, CameraIcon, DoneIcon } from '@blocksuite/icons';
import { useAtom } from 'jotai';
import { signOut } from 'next-auth/react';
import { type FC, useCallback, useState } from 'react';

import { openAuthModalAtom } from '../../../../atoms';
import type { Update, User } from '../../../../atoms/user';
import { toast } from '../../../../utils';
import { Upload } from '../../../pure/file-upload';
import * as style from './style.css';

export const AvatarAndName: FC<{
  user: User;
  update: Update;
}> = ({ user, update }) => {
  const t = useAFFiNEI18N();

  const [input, setInput] = useState<string>(user.name);

  const handleUpdateUserName = useCallback(
    (newName: string) => {
      update({ name: newName }).catch(console.error);
    },
    [update]
  );

  const handleUpdateUserAvatar = useCallback(
    async (file: File) => {
      update({ avatar: file }).catch(console.error);
    },
    [update]
  );

  return (
    <>
      <SettingRow
        name={t['com.affine.settings.profile']()}
        desc={t['com.affine.settings.profile.message']()}
        spreadCol={false}
      >
        <FlexWrapper style={{ margin: '12px 0 24px 0' }} alignItems="center">
          <div className={style.avatarWrapper}>
            <Upload
              accept="image/gif,image/jpeg,image/jpg,image/png,image/svg"
              fileChange={handleUpdateUserAvatar}
              data-testid="upload-user-avatar"
            >
              <>
                <div className="camera-icon-wrapper">
                  <CameraIcon />
                </div>
                <UserAvatar
                  size={56}
                  name={user.name}
                  url={user.avatarUrl || ''}
                  className="avatar"
                />
              </>
            </Upload>
          </div>

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
                <IconButton
                  data-testid="save-user-name"
                  onClick={() => {
                    handleUpdateUserName(input);
                  }}
                  style={{
                    color: 'var(--affine-primary-color)',
                    marginLeft: '12px',
                  }}
                >
                  <DoneIcon />
                </IconButton>
              )}
            </FlexWrapper>
          </div>
        </FlexWrapper>
      </SettingRow>
    </>
  );
};

export const AccountSetting: FC<{
  user: User;
  update: Update;
}> = ({ user, update }) => {
  const t = useAFFiNEI18N();
  const [, setAuthModal] = useAtom(openAuthModalAtom);

  const onChangePassword = useCallback(() => {
    setAuthModal({ open: true, state: 'sendPasswordEmail', email: user.email });
  }, [setAuthModal, user.email]);

  return (
    <>
      <SettingHeader
        title={t['com.affine.setting.account']()}
        subtitle={t['com.affine.setting.account.message']()}
        data-testid="account-title"
      />
      <AvatarAndName user={user} update={update} />
      <SettingRow name={t['com.affine.settings.email']()} desc={user.email}>
        <Button
          onClick={useCallback(() => {
            toast('Function coming soon');
          }, [])}
        >
          {t['com.affine.settings.email.action']()}
        </Button>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.password']()}
        desc={t['com.affine.settings.password.message']()}
      >
        <Button onClick={onChangePassword}>
          {t['com.affine.settings.password.action']()}
        </Button>
      </SettingRow>

      <SettingRow
        name={t[`Sign out`]()}
        desc={t['com.affine.setting.sign.out.message']()}
        style={{ cursor: 'pointer' }}
        onClick={useCallback(() => {
          signOut().catch(console.error);
        }, [])}
      >
        <ArrowRightSmallIcon />
      </SettingRow>
      <SettingRow
        name={
          <span style={{ color: 'var(--affine-warning-color)' }}>
            {t['com.affine.setting.account.delete']()}
          </span>
        }
        desc={t['com.affine.setting.account.delete.message']()}
        style={{ cursor: 'pointer' }}
        onClick={useCallback(() => {
          toast('Function coming soon');
        }, [])}
        testId="delete-account-button"
      >
        <ArrowRightSmallIcon />
      </SettingRow>
    </>
  );
};
