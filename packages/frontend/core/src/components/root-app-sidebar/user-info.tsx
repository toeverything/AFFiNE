import {
  Avatar,
  Button,
  Divider,
  ErrorMessage,
  Menu,
  MenuIcon,
  MenuItem,
  Skeleton,
} from '@affine/component';
import {
  authAtom,
  openDisableCloudAlertModalAtom,
  openSettingModalAtom,
  openSignOutModalAtom,
} from '@affine/core/atoms';
import { mixpanel } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { AccountIcon, SignOutIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useSetAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

import {
  type AuthAccountInfo,
  AuthService,
  UserQuotaService,
} from '../../modules/cloud';
import * as styles from './index.css';
import { UnknownUserIcon } from './unknow-user';

export const UserInfo = () => {
  const session = useService(AuthService).session;
  const account = useLiveData(session.account$);
  return account ? (
    <AuthorizedUserInfo account={account} />
  ) : (
    <UnauthorizedUserInfo />
  );
};

const AuthorizedUserInfo = ({ account }: { account: AuthAccountInfo }) => {
  return (
    <Menu items={<OperationMenu />}>
      <Button
        data-testid="sidebar-user-avatar"
        type="plain"
        className={styles.userInfoWrapper}
      >
        <Avatar size={24} name={account.label} url={account.avatar} />
      </Button>
    </Menu>
  );
};

const UnauthorizedUserInfo = () => {
  const setDisableCloudOpen = useSetAtom(openDisableCloudAlertModalAtom);
  const setOpen = useSetAtom(authAtom);

  const openSignInModal = useCallback(() => {
    if (!runtimeConfig.enableCloud) setDisableCloudOpen(true);
    else setOpen(state => ({ ...state, openModal: true }));
  }, [setDisableCloudOpen, setOpen]);

  return (
    <Button
      onClick={openSignInModal}
      data-testid="sidebar-user-avatar"
      type="plain"
      className={styles.userInfoWrapper}
    >
      <UnknownUserIcon width={24} height={24} />
    </Button>
  );
};

const AccountMenu = () => {
  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const setOpenSignOutModalAtom = useSetAtom(openSignOutModalAtom);

  const onOpenAccountSetting = useCallback(() => {
    mixpanel.track('AccountSettingsViewed', {
      // page:
      segment: 'navigation panel',
      module: 'profile and badge',
      control: 'profile and email',
    });
    setSettingModalAtom(prev => ({
      ...prev,
      open: true,
      activeTab: 'account',
    }));
  }, [setSettingModalAtom]);

  const onOpenSignOutModal = useCallback(() => {
    setOpenSignOutModalAtom(true);
  }, [setOpenSignOutModalAtom]);

  const t = useAFFiNEI18N();

  return (
    <>
      <MenuItem
        preFix={
          <MenuIcon>
            <AccountIcon />
          </MenuIcon>
        }
        data-testid="workspace-modal-account-settings-option"
        onClick={onOpenAccountSetting}
      >
        {t['com.affine.workspace.cloud.account.settings']()}
      </MenuItem>
      <Divider />
      <MenuItem
        preFix={
          <MenuIcon>
            <SignOutIcon />
          </MenuIcon>
        }
        data-testid="workspace-modal-sign-out-option"
        onClick={onOpenSignOutModal}
      >
        {t['com.affine.workspace.cloud.account.logout']()}
      </MenuItem>
    </>
  );
};

const CloudUsage = () => {
  const quota = useService(UserQuotaService).quota;
  const quotaError = useLiveData(quota.error$);

  useEffect(() => {
    // revalidate quota to get the latest status
    quota.revalidate();
  }, [quota]);
  const color = useLiveData(quota.color$);
  const usedFormatted = useLiveData(quota.usedFormatted$);
  const maxFormatted = useLiveData(quota.maxFormatted$);
  const percent = useLiveData(quota.percent$);

  if (percent === null) {
    if (quotaError) {
      return <ErrorMessage>Failed to load quota</ErrorMessage>;
    }
    return (
      <div>
        <Skeleton height={15} width={50} />
        <Skeleton height={10} style={{ marginTop: 4 }} />
      </div>
    );
  }

  return (
    <div
      className={styles.cloudUsage}
      style={assignInlineVars({
        [styles.progressColorVar]: color,
      })}
    >
      <div className={styles.cloudUsageLabel}>
        <span className={styles.cloudUsageLabelUsed}>{usedFormatted}</span>
        <span>&nbsp;/&nbsp;</span>
        <span>{maxFormatted}</span>
      </div>

      <div className={styles.cloudUsageBar}>
        <div
          className={styles.cloudUsageBarInner}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

const OperationMenu = () => {
  return (
    <>
      <CloudUsage />
      <Divider />
      <AccountMenu />
    </>
  );
};
