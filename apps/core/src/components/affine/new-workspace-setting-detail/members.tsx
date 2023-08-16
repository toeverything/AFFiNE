import { FlexWrapper, Menu, MenuItem, Tooltip } from '@affine/component';
import {
  InviteModal,
  type InviteModalProps,
} from '@affine/component/member-components';
import { SettingRow } from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { MoreVerticalIcon } from '@blocksuite/icons';
import { Button, IconButton } from '@toeverything/components/button';
import type { MouseEvent, ReactElement } from 'react';
import { Suspense, useCallback, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { useInviteMember } from '../../../hooks/affine/use-invite-member';
import { useIsWorkspaceOwner } from '../../../hooks/affine/use-is-workspace-owner';
import { type Member, useMembers } from '../../../hooks/affine/use-members';
import { useRevokeMemberPermission } from '../../../hooks/affine/use-revoke-member-permission';
import type { AffineOfficialWorkspace } from '../../../shared';
import { WorkspaceAvatar } from '../../pure/footer';
import { AnyErrorBoundary } from '../any-error-boundary';
import * as style from './style.css';
import { useSetAtom } from 'jotai/index';
import { pushNotificationAtom } from '@affine/component/notification-center';

export type MembersPanelProps = {
  workspace: AffineOfficialWorkspace;
};
const MembersPanelLocal = () => {
  const t = useAFFiNEI18N();
  return (
    <Tooltip
      content={t['com.affine.settings.workspace.member.local-tooltip']()}
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
  const invite = useInviteMember(workspaceId);
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
            />
          </>
        ) : null}
      </SettingRow>
      <FlexWrapper flexDirection="column" className={style.membersList}>
        {members.map(member => (
          <Member
            key={member.id}
            member={member}
            workspaceId={workspaceId}
            showOperationButton={isOwner}
          />
        ))}
      </FlexWrapper>
    </>
  );
};

const Member = ({
  member,
  showOperationButton,
  workspaceId,
}: {
  member: Member;
  showOperationButton: boolean;
  workspaceId: string;
}) => {
  const revokeMemberPermission = useRevokeMemberPermission(workspaceId);

  const onClickRevoke = useCallback(
    async (event: MouseEvent<HTMLButtonElement>) => {
      const button = event.target;
      if (button instanceof HTMLButtonElement) {
        const memberId = button.getAttribute('data-member-id');
        if (memberId) {
          await revokeMemberPermission(memberId);
        } else {
          throw new Error('Unexpected event target, missing data-member-id');
        }
      } else {
        throw new Error('Unexpected event target');
      }
    },
    [revokeMemberPermission]
  );
  return (
    <div key={member.id} className={style.listItem}>
      <div>
        <WorkspaceAvatar
          size={24}
          name={undefined}
          avatar={member.avatarUrl as string}
        />
      </div>
      <div className={style.memberContainer}>
        <div className={style.memberName}>{member.name}</div>
        <div className={style.memberEmail}>{member.email}</div>
      </div>
      <div className={style.permissionContainer}>{member.permission}</div>
      <Menu
        content={
          <MenuItem>
            Remove from Workspace
            {/*<button data-member-id={member.id} onClick={onClickRevoke}>*/}
            {/*  Remove from Workspace*/}
            {/*</button>*/}
          </MenuItem>
        }
        placement="bottom"
        disablePortal={true}
        trigger="click"
      >
        <IconButton>
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
