import { Button, Input } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { inviteByEmailMutation, Permission } from '@affine/graphql';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useState } from 'react';

import { useMembers } from '../../../hooks/affine/use-members';
import type { AffineOfficialWorkspace } from '../../../shared';
import { useMutation } from '../../../shared/gql';
import { toast } from '../../../utils';

export type MembersPanelProps = {
  workspace: AffineOfficialWorkspace;
};

export const CloudWorkspaceMembersPanel = (
  props: MembersPanelProps
): ReactElement => {
  const workspaceId = props.workspace.id;
  const members = useMembers(workspaceId);

  const [inviteEmail, setInviteEmail] = useState('');
  const { trigger } = useMutation({
    mutation: inviteByEmailMutation,
  });

  const memberCount = members.length;
  const memberPanel =
    memberCount > 0 ? (
      members.map(member => <div key={member.id}>{member.name}</div>)
    ) : (
      <div>No Members</div>
    );

  return (
    <>
      <SettingRow name="Members" desc="" />
      <div>
        <Input placeholder="Invite by email" onChange={setInviteEmail} />
        <Button
          onClick={useCallback(async () => {
            const emailRegex = new RegExp(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
            if (!emailRegex.test(inviteEmail)) {
              // fixme: hidden behind the setting modal
              toast('Invalid email');
              return;
            }

            await trigger({
              workspaceId,
              email: inviteEmail,
              // fixme: we now only support admin permission
              permission: Permission.Admin,
            });
          }, [inviteEmail, trigger, workspaceId])}
        >
          Invite
        </Button>
      </div>
      {memberPanel}
    </>
  );
};

export const MembersPanel = (props: MembersPanelProps): ReactElement | null => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return null;
  }
  return (
    <Suspense>
      <CloudWorkspaceMembersPanel {...props} />
    </Suspense>
  );
};
