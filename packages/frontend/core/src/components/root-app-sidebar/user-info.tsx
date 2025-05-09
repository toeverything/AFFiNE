import {
  Avatar,
  Divider,
  ErrorMessage,
  IconButton,
  Menu,
  MenuItem,
  type MenuProps,
  Skeleton,
} from '@affine/component';
import {
  GlobalDialogService,
  WorkspaceDialogService,
} from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { AccountIcon, AdminIcon, SignOutIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useCallback, useEffect } from 'react';

import {
  type AuthAccountInfo,
  AuthService,
  ServerService,
  SubscriptionService,
  UserCopilotQuotaService,
  UserFeatureService,
  UserQuotaService,
} from '../../modules/cloud';
import { UserPlanButton } from '../affine/auth/user-plan-button';
import { useSignOut } from '../hooks/affine/use-sign-out';
import { useCatchEventCallback } from '../hooks/use-catch-event-hook';
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

const menuContentOptions: MenuProps['contentOptions'] = {
  className: styles.operationMenu,
};
const AuthorizedUserInfo = ({ account }: { account: AuthAccountInfo }) => {
  return (
    <Menu items={<OperationMenu />} contentOptions={menuContentOptions}>
      <IconButton data-testid="sidebar-user-avatar" variant="plain" size="24">
        <Avatar size={24} name={account.label} url={account.avatar} />
      </IconButton>
    </Menu>
  );
};

const UnauthorizedUserInfo = () => {
  const globalDialogService = useService(GlobalDialogService);

  const openSignInModal = useCallback(() => {
    globalDialogService.open('sign-in', {});
  }, [globalDialogService]);

  return (
    <IconButton
      onClick={openSignInModal}
      data-testid="sidebar-user-avatar"
      variant="plain"
      size="24"
    >
      <UnknownUserIcon />
    </IconButton>
  );
};

const AccountMenu = () => {
  const workspaceDialogService = useService(WorkspaceDialogService);
  const openSignOutModal = useSignOut();
  const serverService = useService(ServerService);
  const userFeatureService = useService(UserFeatureService);
  const isAdmin = useLiveData(userFeatureService.userFeature.isAdmin$);

  const onOpenAccountSetting = useCallback(() => {
    track.$.navigationPanel.profileAndBadge.openSettings({ to: 'account' });
    workspaceDialogService.open('setting', {
      activeTab: 'account',
    });
  }, [workspaceDialogService]);

  const onOpenAdminPanel = useCallback(() => {
    window.open(`${serverService.server.baseUrl}/admin`, '_blank');
  }, [serverService.server.baseUrl]);

  const t = useI18n();

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  return (
    <>
      <MenuItem
        prefixIcon={<AccountIcon />}
        data-testid="workspace-modal-account-settings-option"
        onClick={onOpenAccountSetting}
      >
        {t['com.affine.workspace.cloud.account.settings']()}
      </MenuItem>
      {isAdmin ? (
        <MenuItem
          prefixIcon={<AdminIcon />}
          data-testid="workspace-modal-account-admin-option"
          onClick={onOpenAdminPanel}
        >
          {t['com.affine.workspace.cloud.account.admin']()}
        </MenuItem>
      ) : null}
      <MenuItem
        prefixIcon={<SignOutIcon />}
        data-testid="workspace-modal-sign-out-option"
        onClick={openSignOutModal}
      >
        {t['com.affine.workspace.cloud.account.logout']()}
      </MenuItem>
    </>
  );
};

const CloudUsage = () => {
  const t = useI18n();
  const quota = useService(UserQuotaService).quota;
  const quotaError = useLiveData(quota.error$);

  const workspaceDialogService = useService(WorkspaceDialogService);
  const handleClick = useCatchEventCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
  }, [workspaceDialogService]);

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
      className={clsx(styles.usageBlock, styles.cloudUsageBlock)}
      style={assignInlineVars({
        [styles.progressColorVar]: color,
      })}
    >
      <div className={styles.usageLabel}>
        <div>
          <span className={styles.usageLabelTitle}>
            {t['com.affine.user-info.usage.cloud']()}
          </span>
          <span>{usedFormatted}</span>
          <span>&nbsp;/&nbsp;</span>
          <span>{maxFormatted}</span>
        </div>
        <UserPlanButton onClick={handleClick} />
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

const AIUsage = () => {
  const t = useI18n();
  const copilotQuotaService = useService(UserCopilotQuotaService);
  const subscriptionService = useService(SubscriptionService);

  useEffect(() => {
    // revalidate latest subscription status
    subscriptionService.subscription.revalidate();
  }, [subscriptionService]);
  useEffect(() => {
    copilotQuotaService.copilotQuota.revalidate();
  }, [copilotQuotaService]);

  const copilotActionLimit = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionLimit$
  );
  const copilotActionUsed = useLiveData(
    copilotQuotaService.copilotQuota.copilotActionUsed$
  );
  const loading = copilotActionLimit === null || copilotActionUsed === null;
  const loadError = useLiveData(copilotQuotaService.copilotQuota.error$);

  const workspaceDialogService = useService(WorkspaceDialogService);

  const goToAIPlanPage = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'aiPricingPlan',
    });
  }, [workspaceDialogService]);

  const goToAccountSetting = useCallback(() => {
    workspaceDialogService.open('setting', {
      activeTab: 'account',
    });
  }, [workspaceDialogService]);

  if (loading) {
    if (loadError) console.error(loadError);
    return null;
  }

  // unlimited
  if (copilotActionLimit === 'unlimited') {
    return (
      <div
        onClick={goToAccountSetting}
        data-pro
        className={clsx(styles.usageBlock, styles.aiUsageBlock)}
      >
        <div className={styles.usageLabel}>
          <div className={styles.usageLabelTitle}>
            {t['com.affine.user-info.usage.ai']()}
          </div>
        </div>
        <div className={styles.usageLabel}>
          {t['com.affine.payment.ai.usage-description-purchased']()}
        </div>
      </div>
    );
  }

  const percent = Math.min(
    100,
    Math.max(
      0.5,
      Number(((copilotActionUsed / copilotActionLimit) * 100).toFixed(4))
    )
  );

  const color = percent > 80 ? cssVar('errorColor') : cssVar('processingColor');

  return (
    <div
      onClick={goToAIPlanPage}
      className={clsx(styles.usageBlock, styles.aiUsageBlock)}
      style={assignInlineVars({
        [styles.progressColorVar]: color,
      })}
    >
      <div className={styles.usageLabel}>
        <div>
          <span className={styles.usageLabelTitle}>
            {t['com.affine.user-info.usage.ai']()}
          </span>
          <span>{copilotActionUsed}</span>
          <span>&nbsp;/&nbsp;</span>
          <span>{copilotActionLimit}</span>
        </div>

        <div className={styles.freeTag}>Free</div>
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
  const serverService = useService(ServerService);
  const serverFeatures = useLiveData(serverService.server.features$);

  return (
    <>
      {serverFeatures?.copilot ? <AIUsage /> : null}
      <CloudUsage />
      <Divider />
      <AccountMenu />
    </>
  );
};
