import { Avatar } from '@affine/component';
import { useSignOut } from '@affine/core/components/hooks/affine/use-sign-out';
import { AuthService } from '@affine/core/modules/cloud';
import { GlobalDialogService } from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { type ReactNode } from 'react';

import { UserPlanTag } from '../../../components';
import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';
import * as styles from './style.css';

export const UserProfile = () => {
  const session = useService(AuthService).session;
  const loginStatus = useLiveData(session.status$);

  return loginStatus === 'authenticated' ? (
    <AuthorizedUserProfile />
  ) : (
    <UnauthorizedUserProfile />
  );
};

const BaseLayout = ({
  avatar,
  title,
  caption,
  sectionTitle,
  onClick,
}: {
  avatar: ReactNode;
  title: ReactNode;
  caption: ReactNode;
  sectionTitle: string;
  onClick?: () => void;
}) => {
  return (
    <SettingGroup title={sectionTitle} contentStyle={{ padding: '12px 14px' }}>
      <div className={styles.profile} onClick={onClick}>
        <div className={styles.avatarWrapper}>{avatar}</div>
        <div className={styles.content}>
          <div className={styles.title}>{title}</div>
          <div className={styles.caption}>{caption}</div>
        </div>
        <ArrowRightSmallIcon className={styles.suffixIcon} />
      </div>
    </SettingGroup>
  );
};

const AuthorizedUserProfile = () => {
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  const confirmSignOut = useSignOut();
  const t = useI18n();

  return (
    <BaseLayout
      sectionTitle={t['com.affine.mobile.setting.account.title']()}
      avatar={
        <Avatar
          size={48}
          rounded={4}
          url={account?.avatar}
          name={account?.label}
        />
      }
      caption={<span className={styles.emailInfo}>{account?.email}</span>}
      title={
        <div className={styles.nameWithTag}>
          <span className={styles.name}>{account?.label}</span>
          <UserPlanTag />
        </div>
      }
      onClick={confirmSignOut}
    />
  );
};

const UnauthorizedUserProfile = () => {
  const t = useI18n();
  const globalDialogService = useService(GlobalDialogService);

  return (
    <SettingGroup title={t['com.affine.mobile.setting.account.title']()}>
      <RowLayout
        label={t['com.affine.mobile.setting.account.sign-in']()}
        onClick={() => globalDialogService.open('sign-in', {})}
      />
    </SettingGroup>
  );
};
