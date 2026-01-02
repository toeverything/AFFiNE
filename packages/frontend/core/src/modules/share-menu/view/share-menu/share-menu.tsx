import { Tabs, Tooltip, useConfirmModal } from '@affine/component';
import { Button } from '@affine/component/ui/button';
import { Menu } from '@affine/component/ui/menu';
import { ServerService } from '@affine/core/modules/cloud';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { ShareInfoService } from '@affine/core/modules/share-doc';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { ServerDeploymentType, SubscriptionPlan } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import type { Store } from '@blocksuite/affine/store';
import { LockIcon, PublishIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import {
  forwardRef,
  type PropsWithChildren,
  type Ref,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import * as styles from './index.css';
import { InviteMemberEditor } from './invite-member-editor/invite-member-editor';
import { MemberManagement } from './member-management';
import { ShareExport } from './share-export';
import { SharePage } from './share-page';

export interface ShareMenuProps extends PropsWithChildren {
  workspaceMetadata: WorkspaceMetadata;
  currentPage: Store;
  onEnableAffineCloud: () => void;
  onOpenShareModal?: (open: boolean) => void;
  openPaywallModal?: () => void;
  hittingPaywall?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export enum ShareMenuTab {
  Share = 'share',
  Export = 'export',
  Invite = 'invite',
  Members = 'members',
}

export const ShareMenuContent = (props: ShareMenuProps) => {
  const t = useI18n();
  const [currentTab, setCurrentTab] = useState(ShareMenuTab.Share);

  const serverService = useService(ServerService);
  const isSelfhosted = useLiveData(
    serverService.server.config$.selector(
      c => c.type === ServerDeploymentType.Selfhosted
    )
  );
  const workspaceQuotaService = useService(WorkspaceQuotaService);
  const quota = useLiveData(workspaceQuotaService.quota.quota$);
  const hittingPaywall = useMemo(() => {
    if (isSelfhosted) {
      return false;
    }
    if (quota) {
      const { name } = quota;
      return name.toLowerCase() === SubscriptionPlan.Free.toLowerCase();
    }
    return true;
  }, [isSelfhosted, quota]);

  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);

  const workspaceDialogService = useService(WorkspaceDialogService);

  const onValueChange = useCallback((value: string) => {
    setCurrentTab(value as ShareMenuTab);
  }, []);

  useEffect(() => {
    workspaceQuotaService.quota.revalidate();
  }, [workspaceQuotaService]);

  const { openConfirmModal } = useConfirmModal();

  const onConfirm = useCallback(() => {
    if (!isOwner) {
      return;
    }
    workspaceDialogService.open('setting', {
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
    return;
  }, [isOwner, workspaceDialogService]);

  const openPaywallModal = useCallback(() => {
    openConfirmModal({
      title:
        t[
          `com.affine.share-menu.paywall.${isOwner ? 'owner' : 'member'}.title`
        ](),
      description:
        t[
          `com.affine.share-menu.paywall.${isOwner ? 'owner' : 'member'}.description`
        ](),
      confirmText:
        t[
          `com.affine.share-menu.paywall.${isOwner ? 'owner' : 'member'}.confirm`
        ](),
      onConfirm: onConfirm,
      cancelText: t['Cancel'](),
      cancelButtonOptions: {
        style: {
          visibility: isOwner ? 'visible' : 'hidden',
        },
      },
      confirmButtonOptions: {
        variant: isOwner ? 'primary' : 'custom',
      },
    });
  }, [isOwner, onConfirm, openConfirmModal, t]);

  if (currentTab === ShareMenuTab.Members) {
    return (
      <MemberManagement
        openPaywallModal={openPaywallModal}
        hittingPaywall={!!hittingPaywall}
        onClickBack={() => {
          setCurrentTab(ShareMenuTab.Share);
        }}
        onClickInvite={() => {
          setCurrentTab(ShareMenuTab.Invite);
        }}
      />
    );
  }
  if (currentTab === ShareMenuTab.Invite) {
    return (
      <InviteMemberEditor
        openPaywallModal={openPaywallModal}
        hittingPaywall={!!hittingPaywall}
        onClickCancel={() => {
          setCurrentTab(ShareMenuTab.Share);
        }}
      />
    );
  }
  return (
    <div className={styles.containerStyle}>
      <Tabs.Root
        defaultValue={ShareMenuTab.Share}
        value={currentTab}
        onValueChange={onValueChange}
      >
        <Tabs.List className={styles.tabList}>
          <Tabs.Trigger value={ShareMenuTab.Share} className={styles.tab}>
            {t['com.affine.share-menu.shareButton']()}
          </Tabs.Trigger>
          <Tabs.Trigger
            value={ShareMenuTab.Export}
            className={styles.tab}
            style={{
              display: BUILD_CONFIG.isMobileEdition ? 'none' : undefined,
            }}
          >
            {t['Export']()}
          </Tabs.Trigger>
          <Tabs.Trigger value={ShareMenuTab.Invite} style={{ display: 'none' }}>
            invite
          </Tabs.Trigger>
          <Tabs.Trigger
            value={ShareMenuTab.Members}
            style={{ display: 'none' }}
          >
            members
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={ShareMenuTab.Share}>
          <SharePage
            hittingPaywall={!!hittingPaywall}
            openPaywallModal={openPaywallModal}
            onClickInvite={() => {
              setCurrentTab(ShareMenuTab.Invite);
            }}
            onClickMembers={() => {
              setCurrentTab(ShareMenuTab.Members);
            }}
            {...props}
          />
        </Tabs.Content>
        <Tabs.Content value={ShareMenuTab.Export}>
          <ShareExport />
        </Tabs.Content>
        <Tabs.Content value={ShareMenuTab.Invite}>
          <div>null</div>
        </Tabs.Content>
        <Tabs.Content value={ShareMenuTab.Members}>
          <div>null</div>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
};

const DefaultShareButton = forwardRef(function DefaultShareButton(
  props: { disabled?: boolean; tooltip?: string },
  ref: Ref<HTMLButtonElement>
) {
  const t = useI18n();
  const shareInfoService = useService(ShareInfoService);
  const shared = useLiveData(shareInfoService.shareInfo.isShared$);

  useEffect(() => {
    if (props.disabled) {
      return;
    }
    shareInfoService.shareInfo.revalidate();
  }, [props.disabled, shareInfoService]);

  const tooltip =
    props.tooltip ??
    (shared
      ? t['com.affine.share-menu.option.link.readonly.description']()
      : t['com.affine.share-menu.option.link.no-access.description']());

  return (
    <Tooltip content={tooltip}>
      <Button
        ref={ref}
        className={styles.button}
        variant="primary"
        disabled={props.disabled}
      >
        <div className={styles.buttonContainer}>
          {shared ? <PublishIcon fontSize={16} /> : <LockIcon fontSize={16} />}
          {t['com.affine.share-menu.shareButton']()}
        </div>
      </Button>
    </Tooltip>
  );
});

const LocalShareMenu = (props: ShareMenuProps) => {
  if (props.disabled) {
    return (
      <div data-testid="local-share-menu-button">
        <DefaultShareButton disabled tooltip={props.disabledReason} />
      </div>
    );
  }
  return (
    <Menu
      items={<ShareMenuContent {...props} />}
      contentOptions={{
        className: styles.localMenuStyle,
        ['data-testid' as string]: 'local-share-menu',
        align: 'end',
      }}
      rootOptions={{
        modal: false,
        onOpenChange: props.onOpenShareModal,
      }}
    >
      <div data-testid="local-share-menu-button">
        {props.children || <DefaultShareButton />}
      </div>
    </Menu>
  );
};

const CloudShareMenu = (props: ShareMenuProps) => {
  if (props.disabled) {
    return (
      <div data-testid="cloud-share-menu-button">
        <DefaultShareButton disabled tooltip={props.disabledReason} />
      </div>
    );
  }
  return (
    <Menu
      items={<ShareMenuContent {...props} />}
      contentOptions={{
        className: styles.menuStyle,
        ['data-testid' as string]: 'cloud-share-menu',
        align: 'end',
      }}
      rootOptions={{
        modal: false,
        onOpenChange: props.onOpenShareModal,
      }}
    >
      <div data-testid="cloud-share-menu-button">
        {props.children || <DefaultShareButton />}
      </div>
    </Menu>
  );
};

export const ShareMenu = (props: ShareMenuProps) => {
  const { workspaceMetadata } = props;

  if (workspaceMetadata.flavour === 'local') {
    return <LocalShareMenu {...props} />;
  }
  return <CloudShareMenu {...props} />;
};
