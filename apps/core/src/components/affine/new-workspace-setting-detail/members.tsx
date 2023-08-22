import { Menu, MenuItem, Tooltip } from '@affine/component';
import {
  InviteModal,
  type InviteModalProps,
} from '@affine/component/member-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { SettingRow } from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreVerticalIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Button, IconButton } from '@toeverything/components/button';
import clsx from 'clsx';
import { useSetAtom } from 'jotai/index';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import type { CheckedUser } from '../../../hooks/affine/use-current-user';
import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { useInviteMember } from '../../../hooks/affine/use-invite-member';
import { useIsWorkspaceOwner } from '../../../hooks/affine/use-is-workspace-owner';
import { type Member, useMembers } from '../../../hooks/affine/use-members';
import { useRevokeMemberPermission } from '../../../hooks/affine/use-revoke-member-permission';
import type { AffineOfficialWorkspace } from '../../../shared';
import { AnyErrorBoundary } from '../any-error-boundary';
import * as style from './style.css';

export type MembersPanelProps = {
  workspace: AffineOfficialWorkspace;
};
const MembersPanelLocal = () => {
  const t = useAFFiNEI18N();
  return (
    <Tooltip
      content={t['com.affine.settings.member-tooltip']()}
      placement="top"
    >
      <div className={style.fakeWrapper}>
        <SettingRow name={`${t['Members']()} (0)`} desc={t['Members hint']()}>
          <Button size="large">{t['Invite Members']()}</Button>
        </SettingRow>
      </div>
    </Tooltip>
  );
};

export const CloudWorkspaceMembersPanel = (
  props: MembersPanelProps
): ReactElement => {
  const workspaceId = props.workspace.id;
  const members = useMembers(workspaceId);
  const t = useAFFiNEI18N();
  const isOwner = useIsWorkspaceOwner(workspaceId);
  const currentUser = useCurrentUser();

  const { invite, isMutating } = useInviteMember(workspaceId);
  const [open, setOpen] = useState(false);
  const pushNotification = useSetAtom(pushNotificationAtom);

  const memberCount = members.length;

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
        pushNotification({
          title: t['Invitation sent'](),
          message: t['Invitation sent hint'](),
          type: 'success',
        });
        setOpen(false);
      }
    },
    [invite, pushNotification, t]
  );

  return (
    <>
      <SettingRow
        name={`${t['Members']()} (${memberCount})`}
        desc={t['Members hint']()}
      >
        {isOwner ? (
          <>
            <Button onClick={openModal}>{t['Invite Members']()}</Button>
            <InviteModal
              open={open}
              setOpen={setOpen}
              onConfirm={onInviteConfirm}
              isMutating={isMutating}
            />
          </>
        ) : null}
      </SettingRow>
      <div className={style.membersList}>
        {members.map(member => (
          <MemberItem
            key={member.id}
            member={member}
            workspaceId={workspaceId}
            isOwner={isOwner}
            currentUser={currentUser}
          />
        ))}
      </div>
    </>
  );
};

const MemberItem = ({
  member,
  isOwner,
  currentUser,
  workspaceId,
}: {
  member: Member;
  workspaceId: string;
  isOwner: boolean;
  currentUser: CheckedUser;
}) => {
  const revokeMemberPermission = useRevokeMemberPermission(workspaceId);

  const handleRevoke = useCallback(
    async (memberId: string) => {
      await revokeMemberPermission(memberId);
    },
    [revokeMemberPermission]
  );

  const showOperationButton = isOwner && currentUser.email !== member.email;
  return (
    <div key={member.id} className={style.listItem}>
      <Avatar
        size={36}
        url={member.avatarUrl as string}
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
        content={
          <MenuItem
            data-member-id={member.id}
            onClick={useCallback(() => {
              handleRevoke(member.id);
            }, [handleRevoke, member.id])}
          >
            Remove from Workspace
          </MenuItem>
        }
        placement="bottom"
        disablePortal={true}
        trigger="click"
      >
        <IconButton
          disabled={!showOperationButton}
          style={{
            visibility: showOperationButton ? 'visible' : 'hidden',
            flexShrink: 0,
          }}
        >
          <MoreVerticalIcon />
        </IconButton>
      </Menu>
    </div>
  );
};

export const MembersPanel = (props: MembersPanelProps): ReactElement | null => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <MembersPanelLocal />;
  }
  return (
    <ErrorBoundary FallbackComponent={AnyErrorBoundary}>
      <Suspense>
        <CloudWorkspaceMembersPanel {...props} />
      </Suspense>
    </ErrorBoundary>
  );
};
