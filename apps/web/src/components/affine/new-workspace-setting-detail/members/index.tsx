import { Button, IconButton, Menu, MenuItem } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { UserAvatar } from '@affine/component/user-avatar';
import { Unreachable } from '@affine/env/constant';
import type { AffineLegacyCloudWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { PermissionType } from '@affine/env/workspace/legacy-cloud';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteTemporarilyIcon, MoreVerticalIcon } from '@blocksuite/icons';
import type { FC } from 'react';
import React, { useCallback, useState } from 'react';

import { useMembers } from '../../../../hooks/affine/use-members';
import type { AffineOfficialWorkspace } from '../../../../shared';
import { toast } from '../../../../utils';
import type { WorkspaceSettingDetailProps } from '../index';
import { fakeWrapper } from '../style.css';
import { InviteMemberModal } from './invite-member-modal';
import * as style from './style.css';

export type AffineRemoteMembersProps = WorkspaceSettingDetailProps & {
  workspace: AffineLegacyCloudWorkspace;
};
export type MemberPanelProps = WorkspaceSettingDetailProps & {
  workspace: AffineOfficialWorkspace;
};

const MemberList: FC<{
  workspace: AffineLegacyCloudWorkspace;
}> = ({ workspace }) => {
  const t = useAFFiNEI18N();
  const { members, removeMember } = useMembers(workspace.id);

  if (members.length) {
    return null;
  }

  return (
    <ul className={style.memberList}>
      {members
        .sort((b, a) => a.type - b.type)
        .map(member => {
          const { id, name, email, avatar_url } = {
            name: '',
            email: '',
            avatar_url: '',
            ...member,
          };
          return (
            <li className="member-list-item" key={id}>
              <div className="left-col">
                <UserAvatar size={36} name={name} url={avatar_url} />
                <div className="user-info-wrapper">
                  <p className="user-name">{name}</p>
                  <p className="email">{email}</p>
                </div>
              </div>
              <div className="right-col">
                <div className="user-identity">
                  {member.accepted
                    ? member.type !== PermissionType.Owner
                      ? t['Member']()
                      : t['Owner']()
                    : t['Pending']()}
                </div>
                <Menu
                  content={
                    <>
                      <MenuItem
                        onClick={async () => {
                          await removeMember(Number(id));
                          toast(
                            t['Member has been removed']({
                              name,
                            })
                          );
                        }}
                        icon={<DeleteTemporarilyIcon />}
                      >
                        {t['Remove from workspace']()}
                      </MenuItem>
                    </>
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
            </li>
          );
        })}
    </ul>
  );
};

export const AffineRemoteMembers: FC<AffineRemoteMembersProps> = ({
  workspace,
}) => {
  const t = useAFFiNEI18N();
  const { members } = useMembers(workspace.id);

  const [isInviteModalShow, setIsInviteModalShow] = useState(false);

  return (
    <>
      <SettingRow
        name={`${t['Members']()} (${members.length})`}
        desc={t['Members hint']()}
        style={{ marginTop: '25px' }}
      >
        <Button
          size="middle"
          onClick={() => {
            setIsInviteModalShow(true);
          }}
        >
          {t['Invite']()}
        </Button>
      </SettingRow>
      <MemberList workspace={workspace} />
      <InviteMemberModal
        onClose={useCallback(() => {
          setIsInviteModalShow(false);
        }, [])}
        onInviteSuccess={useCallback(() => {
          setIsInviteModalShow(false);
        }, [])}
        workspaceId={workspace.id}
        open={isInviteModalShow}
      />
    </>
  );
};
export const FakeMembers: FC = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={fakeWrapper} style={{ marginTop: '25px' }}>
      <SettingRow name={`${t['Members']()} (0)`} desc={t['Members hint']()}>
        <Button size="middle">{t['Invite']()}</Button>
      </SettingRow>
    </div>
  );
};

export const MembersPanel: FC<MemberPanelProps> = props => {
  switch (props.workspace.flavour) {
    case WorkspaceFlavour.AFFINE: {
      const workspace = props.workspace as AffineLegacyCloudWorkspace;
      return <AffineRemoteMembers {...props} workspace={workspace} />;
    }
    case WorkspaceFlavour.LOCAL: {
      return <FakeMembers />;
    }
  }
  throw new Unreachable();
};
