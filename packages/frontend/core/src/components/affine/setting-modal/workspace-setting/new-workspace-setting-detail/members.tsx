import { notify } from '@affine/component';
import type { InviteModalProps } from '@affine/component/member-components';
import {
  InviteModal,
  MemberLimitModal,
  Pagination,
} from '@affine/component/member-components';
import { SettingRow } from '@affine/component/setting-components';
import { Avatar } from '@affine/component/ui/avatar';
import { Button, IconButton } from '@affine/component/ui/button';
import { Loading } from '@affine/component/ui/loading';
import { Menu, MenuItem } from '@affine/component/ui/menu';
import { Tooltip } from '@affine/component/ui/tooltip';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { openSettingModalAtom } from '@affine/core/components/atoms';
import { useInviteMember } from '@affine/core/components/hooks/affine/use-invite-member';
import { useRevokeMemberPermission } from '@affine/core/components/hooks/affine/use-revoke-member-permission';
import {
  type Member,
  WorkspaceMembersService,
  WorkspacePermissionService,
} from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Permission, UserFriendlyError } from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { MoreVerticalIcon } from '@blocksuite/icons/rc';
import {
  useEnsureLiveData,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { cssVar } from '@toeverything/theme';
import clsx from 'clsx';
import { useSetAtom } from 'jotai';
import { clamp } from 'lodash-es';
import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  type AuthAccountInfo,
  AuthService,
  ServerConfigService,
  SubscriptionService,
} from '../../../../../modules/cloud';
import * as style from './style.css';

type OnRevoke = (memberId: string) => void;
const MembersPanelLocal = () => {
  const t = useI18n();
  return (
    <Tooltip content={t['com.affine.settings.member-tooltip']()}>
      <div className={style.fakeWrapper}>
        <SettingRow name={`${t['Members']()} (0)`} desc={t['Members hint']()}>
          <Button>{t['Invite Members']()}</Button>
        </SettingRow>
      </div>
    </Tooltip>
  );
};

export const CloudWorkspaceMembersPanel = () => {
  const serverConfig = useService(ServerConfigService).serverConfig;
  const hasPaymentFeature = useLiveData(
    serverConfig.features$.map(f => f?.payment)
  );
  const workspace = useService(WorkspaceService).workspace;

  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);

  const workspaceQuotaService = useService(WorkspaceQuotaService);
  useEffect(() => {
    workspaceQuotaService.quota.revalidate();
  }, [workspaceQuotaService]);
  const isLoading = useLiveData(workspaceQuotaService.quota.isLoading$);
  const error = useLiveData(workspaceQuotaService.quota.error$);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const subscriptionService = useService(SubscriptionService);
  const plan = useLiveData(
    subscriptionService.subscription.pro$.map(s => s?.plan)
  );
  const isLimited =
    workspaceQuota && workspaceQuota.memberLimit
      ? workspaceQuota.memberCount >= workspaceQuota.memberLimit
      : null;

  const t = useI18n();
  const { invite, isMutating } = useInviteMember(workspace.id);
  const revokeMemberPermission = useRevokeMemberPermission(workspace.id);

  const [open, setOpen] = useState(false);

  const openModal = useCallback(() => {
    setOpen(true);
  }, []);

  const onInviteConfirm = useCallback<InviteModalProps['onConfirm']>(
    async ({ email, permission }) => {
      const success = await invite(
        email,
        permission,
        // send invite email
        true
      );
      if (success) {
        notify.success({
          title: t['Invitation sent'](),
          message: t['Invitation sent hint'](),
        });
        setOpen(false);
      }
    },
    [invite, t]
  );

  const setSettingModalAtom = useSetAtom(openSettingModalAtom);
  const handleUpgradeConfirm = useCallback(() => {
    setSettingModalAtom({
      open: true,
      activeTab: 'plans',
      scrollAnchor: 'cloudPricingPlan',
    });
    track.$.settingsPanel.workspace.viewPlans({
      control: 'inviteMember',
    });
  }, [setSettingModalAtom]);

  const onRevoke = useCallback<OnRevoke>(
    async memberId => {
      const res = await revokeMemberPermission(memberId);
      if (res?.revoke) {
        notify.success({ title: t['Removed successfully']() });
      }
    },
    [revokeMemberPermission, t]
  );

  const desc = useMemo(() => {
    if (!workspaceQuota) return null;
    return (
      <span>
        {t['com.affine.payment.member.description2']()}
        {hasPaymentFeature ? (
          <div
            className={style.goUpgradeWrapper}
            onClick={handleUpgradeConfirm}
          >
            <span className={style.goUpgrade}>
              {t['com.affine.payment.member.description.choose-plan']()}
            </span>
          </div>
        ) : null}
      </span>
    );
  }, [handleUpgradeConfirm, hasPaymentFeature, t, workspaceQuota]);

  if (workspaceQuota === null) {
    if (isLoading) {
      return <MembersPanelFallback />;
    } else {
      return (
        <span style={{ color: cssVar('errorColor') }}>
          {error
            ? UserFriendlyError.fromAnyError(error).message
            : 'Failed to load members'}
        </span>
      );
    }
  }

  return (
    <>
      <SettingRow
        name={`${t['Members']()} (${workspaceQuota.memberCount}/${workspaceQuota.humanReadable.memberLimit})`}
        desc={desc}
        spreadCol={!!isOwner}
      >
        {isOwner ? (
          <>
            <Button onClick={openModal}>{t['Invite Members']()}</Button>
            {isLimited ? (
              <MemberLimitModal
                isFreePlan={!!plan}
                open={open}
                plan={workspaceQuota.humanReadable.name ?? ''}
                quota={workspaceQuota.humanReadable.memberLimit ?? ''}
                setOpen={setOpen}
                onConfirm={handleUpgradeConfirm}
              />
            ) : (
              <InviteModal
                open={open}
                setOpen={setOpen}
                onConfirm={onInviteConfirm}
                isMutating={isMutating}
              />
            )}
          </>
        ) : null}
      </SettingRow>

      <div className={style.membersPanel}>
        <MemberList isOwner={!!isOwner} onRevoke={onRevoke} />
      </div>
    </>
  );
};
export const MembersPanelFallback = () => {
  const t = useI18n();

  return (
    <>
      <SettingRow
        name={t['Members']()}
        desc={t['com.affine.payment.member.description2']()}
      />
      <div className={style.membersPanel}>
        <MemberListFallback memberCount={1} />
      </div>
    </>
  );
};

const MemberListFallback = ({ memberCount }: { memberCount?: number }) => {
  // prevent page jitter
  const height = useMemo(() => {
    if (memberCount) {
      // height and margin-bottom
      return memberCount * 58 + (memberCount - 1) * 6;
    }
    return 'auto';
  }, [memberCount]);
  const t = useI18n();

  return (
    <div
      style={{
        height,
      }}
      className={style.membersFallback}
    >
      <Loading size={20} />
      <span>{t['com.affine.settings.member.loading']()}</span>
    </div>
  );
};

const MemberList = ({
  isOwner,
  onRevoke,
}: {
  isOwner: boolean;
  onRevoke: OnRevoke;
}) => {
  const membersService = useService(WorkspaceMembersService);
  const memberCount = useLiveData(membersService.members.memberCount$);
  const pageNum = useLiveData(membersService.members.pageNum$);
  const isLoading = useLiveData(membersService.members.isLoading$);
  const error = useLiveData(membersService.members.error$);
  const pageMembers = useLiveData(membersService.members.pageMembers$);

  useEffect(() => {
    membersService.members.revalidate();
  }, [membersService]);

  const session = useService(AuthService).session;
  const account = useEnsureLiveData(session.account$);

  const handlePageChange = useCallback(
    (_: number, pageNum: number) => {
      membersService.members.setPageNum(pageNum);
      membersService.members.revalidate();
    },
    [membersService]
  );

  return (
    <div className={style.memberList}>
      {pageMembers === undefined ? (
        isLoading ? (
          <MemberListFallback
            memberCount={
              memberCount
                ? clamp(
                    memberCount - pageNum * membersService.members.PAGE_SIZE,
                    1,
                    membersService.members.PAGE_SIZE
                  )
                : 1
            }
          />
        ) : (
          <span style={{ color: cssVar('errorColor') }}>
            {error
              ? UserFriendlyError.fromAnyError(error).message
              : 'Failed to load members'}
          </span>
        )
      ) : (
        pageMembers?.map(member => (
          <MemberItem
            currentAccount={account}
            key={member.id}
            member={member}
            isOwner={isOwner}
            onRevoke={onRevoke}
          />
        ))
      )}
      {memberCount !== undefined &&
        memberCount > membersService.members.PAGE_SIZE && (
          <Pagination
            totalCount={memberCount}
            countPerPage={membersService.members.PAGE_SIZE}
            pageNum={pageNum}
            onPageChange={handlePageChange}
          />
        )}
    </div>
  );
};

const MemberItem = ({
  member,
  isOwner,
  currentAccount,
  onRevoke,
}: {
  member: Member;
  isOwner: boolean;
  currentAccount: AuthAccountInfo;
  onRevoke: OnRevoke;
}) => {
  const t = useI18n();

  const handleRevoke = useCallback(() => {
    onRevoke(member.id);
  }, [onRevoke, member.id]);

  const operationButtonInfo = useMemo(() => {
    return {
      show: isOwner && currentAccount.id !== member.id,
      leaveOrRevokeText: t['Remove from workspace'](),
    };
  }, [currentAccount.id, isOwner, member.id, t]);

  return (
    <div
      key={member.id}
      className={style.memberListItem}
      data-testid="member-item"
    >
      <Avatar
        size={36}
        url={member.avatarUrl}
        name={(member.name ? member.name : member.email) as string}
      />
      <div className={style.memberContainer}>
        {member.name ? (
          <>
            <div className={style.memberName}>{member.name}</div>
            <div className={style.memberEmail}>{member.email}</div>
          </>
        ) : (
          <div className={style.memberName}>{member.email}</div>
        )}
      </div>
      <div
        className={clsx(style.roleOrStatus, {
          pending: !member.accepted,
        })}
      >
        {member.accepted
          ? member.permission === Permission.Owner
            ? 'Workspace Owner'
            : 'Member'
          : 'Pending'}
      </div>
      <Menu
        items={
          <MenuItem data-member-id={member.id} onClick={handleRevoke}>
            {operationButtonInfo.leaveOrRevokeText}
          </MenuItem>
        }
      >
        <IconButton
          disabled={!operationButtonInfo.show}
          style={{
            visibility: operationButtonInfo.show ? 'visible' : 'hidden',
            flexShrink: 0,
          }}
        >
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </div>
  );
};

export const MembersPanel = (): ReactElement | null => {
  const workspace = useService(WorkspaceService).workspace;
  if (workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <MembersPanelLocal />;
  }
  return (
    <AffineErrorBoundary>
      <CloudWorkspaceMembersPanel />
    </AffineErrorBoundary>
  );
};
