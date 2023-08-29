import { Menu, MenuItem } from '@affine/component';
import {
  InviteModal,
  type InviteModalProps,
} from '@affine/component/member-components';
import { pushNotificationAtom } from '@affine/component/notification-center';
import { SettingRow } from '@affine/component/setting-components';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreVerticalIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { Button, IconButton } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useSetAtom } from 'jotai/react';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useMemo, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import type { CheckedUser } from '../../../hooks/affine/use-current-user';
import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { useInviteMember } from '../../../hooks/affine/use-invite-member';
import { type Member, useMembers } from '../../../hooks/affine/use-members';
import { useRevokeMemberPermission } from '../../../hooks/affine/use-revoke-member-permission';
import { AnyErrorBoundary } from '../any-error-boundary';
import { type WorkspaceSettingDetailProps } from './index';
import * as style from './style.css';

export interface MembersPanelProps extends WorkspaceSettingDetailProps {
  workspace: AffineOfficialWorkspace;
}

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

export const CloudWorkspaceMembersPanel = ({
  workspace,
  isOwner,
}: MembersPanelProps): ReactElement => {
  const workspaceId = workspace.id;
  const members = useMembers(workspaceId);
  const t = useAFFiNEI18N();
  const currentUser = useCurrentUser();
  const { invite, isMutating } = useInviteMember(workspaceId);
  const [open, setOpen] = useState(false);
  const pushNotification = useSetAtom(pushNotificationAtom);
  const revokeMemberPermission = useRevokeMemberPermission(workspaceId);

  const memberCount = members.length;
  const memberList = useMemo(
    () =>
      members.sort((a, b) => {
        if (
          a.permission === Permission.Owner &&
          b.permission !== Permission.Owner
        ) {
          return -1;
        }
        if (
          a.permission !== Permission.Owner &&
          b.permission === Permission.Owner
        ) {
          return 1;
        }
        return 0;
      }),
    [members]
  );

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
        {memberList.map(member => (
          <MemberItem
            key={member.id}
            member={member}
            isOwner={isOwner}
            currentUser={currentUser}
            onRevoke={revokeMemberPermission}
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
  onRevoke,
}: {
  member: Member;
  isOwner: boolean;
  currentUser: CheckedUser;
  onRevoke: (memberId: string) => void;
}) => {
  const t = useAFFiNEI18N();

  const handleRevoke = useCallback(() => {
    onRevoke(member.id);
  }, [onRevoke, member.id]);

  const operationButtonInfo = useMemo(() => {
    return {
      show: isOwner && currentUser.id !== member.id,
      leaveOrRevokeText: t['Remove from workspace'](),
    };
  }, [currentUser.id, isOwner, member.id, t]);

  return (
    <>
      <div key={member.id} className={style.listItem}>
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
          content={
            <MenuItem data-member-id={member.id} onClick={handleRevoke}>
              {operationButtonInfo.leaveOrRevokeText}
            </MenuItem>
          }
          placement="bottom"
          disablePortal={true}
          trigger="click"
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
    </>
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
