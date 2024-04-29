import { notify } from '@affine/component';
import type {
  InviteModalProps,
  PaginationProps,
} from '@affine/component/member-components';
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
import { openSettingModalAtom } from '@affine/core/atoms';
import { AffineErrorBoundary } from '@affine/core/components/affine/affine-error-boundary';
import { useInviteMember } from '@affine/core/hooks/affine/use-invite-member';
import { useMemberCount } from '@affine/core/hooks/affine/use-member-count';
import type { Member } from '@affine/core/hooks/affine/use-members';
import { useMembers } from '@affine/core/hooks/affine/use-members';
import { useRevokeMemberPermission } from '@affine/core/hooks/affine/use-revoke-member-permission';
import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceQuotaService } from '@affine/core/modules/quota';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreVerticalIcon } from '@blocksuite/icons';
import {
  useEnsureLiveData,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import clsx from 'clsx';
import { useSetAtom } from 'jotai';
import type { ReactElement } from 'react';
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type AuthAccountInfo,
  AuthService,
  ServerConfigService,
  SubscriptionService,
} from '../../../../../modules/cloud';
import * as style from './style.css';

const COUNT_PER_PAGE = 8;
type OnRevoke = (memberId: string) => void;
const MembersPanelLocal = () => {
  const t = useAFFiNEI18N();
  return (
    <Tooltip content={t['com.affine.settings.member-tooltip']()}>
      <div className={style.fakeWrapper}>
        <SettingRow name={`${t['Members']()} (0)`} desc={t['Members hint']()}>
          <Button size="large">{t['Invite Members']()}</Button>
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
  const memberCount = useMemberCount(workspace.id);

  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);

  const checkMemberCountLimit = useCallback(
    (memberCount: number, memberLimit?: number) => {
      if (memberLimit === undefined) return false;
      return memberCount >= memberLimit;
    },
    []
  );

  const workspaceQuotaService = useService(WorkspaceQuotaService);
  useEffect(() => {
    workspaceQuotaService.quota.revalidate();
  }, [workspaceQuotaService]);
  const workspaceQuota = useLiveData(workspaceQuotaService.quota.quota$);
  const subscriptionService = useService(SubscriptionService);
  const plan = useLiveData(
    subscriptionService.subscription.pro$.map(s => s?.plan)
  );
  const isLimited = workspaceQuota
    ? checkMemberCountLimit(memberCount, workspaceQuota.memberLimit)
    : null;

  const t = useAFFiNEI18N();
  const { invite, isMutating } = useInviteMember(workspace.id);
  const revokeMemberPermission = useRevokeMemberPermission(workspace.id);

  const [open, setOpen] = useState(false);
  const [memberSkip, setMemberSkip] = useState(0);

  const openModal = useCallback(() => {
    setOpen(true);
  }, []);

  const onPageChange = useCallback<PaginationProps['onPageChange']>(offset => {
    setMemberSkip(offset);
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
    });
  }, [setSettingModalAtom]);

  const listContainerRef = useRef<HTMLDivElement | null>(null);
  const [memberListHeight, setMemberListHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    if (
      memberCount > COUNT_PER_PAGE &&
      listContainerRef.current &&
      memberListHeight === null
    ) {
      const rect = listContainerRef.current.getBoundingClientRect();
      setMemberListHeight(rect.height);
    }
  }, [listContainerRef, memberCount, memberListHeight]);

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
    // TODO: loading ui
    return null;
  }

  return (
    <>
      <SettingRow
        name={`${t['Members']()} (${memberCount}/${workspaceQuota.humanReadable.memberLimit})`}
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

      <div
        className={style.membersPanel}
        ref={listContainerRef}
        style={memberListHeight ? { height: memberListHeight } : {}}
      >
        <Suspense fallback={<MemberListFallback memberCount={memberCount} />}>
          <MemberList
            workspaceId={workspace.id}
            isOwner={!!isOwner}
            skip={memberSkip}
            onRevoke={onRevoke}
          />
        </Suspense>

        {memberCount > COUNT_PER_PAGE && (
          <Pagination
            totalCount={memberCount}
            countPerPage={COUNT_PER_PAGE}
            onPageChange={onPageChange}
          />
        )}
      </div>
    </>
  );
};
export const MembersPanelFallback = () => {
  const t = useAFFiNEI18N();

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

const MemberListFallback = ({ memberCount }: { memberCount: number }) => {
  // prevent page jitter
  const height = useMemo(() => {
    if (memberCount > COUNT_PER_PAGE) {
      // height and margin-bottom
      return COUNT_PER_PAGE * 58 + (COUNT_PER_PAGE - 1) * 6;
    }
    return 'auto';
  }, [memberCount]);
  const t = useAFFiNEI18N();

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
  workspaceId,
  isOwner,
  skip,
  onRevoke,
}: {
  workspaceId: string;
  isOwner: boolean;
  skip: number;
  onRevoke: OnRevoke;
}) => {
  const members = useMembers(workspaceId, skip, COUNT_PER_PAGE);
  const session = useService(AuthService).session;
  const account = useEnsureLiveData(session.account$);

  return (
    <div className={style.memberList}>
      {members.map(member => (
        <MemberItem
          currentAccount={account}
          key={member.id}
          member={member}
          isOwner={isOwner}
          onRevoke={onRevoke}
        />
      ))}
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
  const t = useAFFiNEI18N();

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
        name={(member.emailVerified ? member.name : member.email) as string}
      />
      <div className={style.memberContainer}>
        {member.emailVerified ? (
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
          type="plain"
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
      <Suspense fallback={<MembersPanelFallback />}>
        <CloudWorkspaceMembersPanel />
      </Suspense>
    </AffineErrorBoundary>
  );
};
