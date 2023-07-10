import {
  Button,
  FlexWrapper,
  Input,
  MenuItem,
  Tooltip,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { inviteByEmailMutation, Permission } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { ReactElement } from 'react';
import { Suspense, useCallback, useState } from 'react';

import { useMembers } from '../../../hooks/affine/use-members';
import type { AffineOfficialWorkspace } from '../../../shared';
import { useMutation } from '../../../shared/gql';
import { toast } from '../../../utils';
import { PermissionSelect } from './permission-select';
import * as style from './style.css';
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
          <Button size="middle">{t['Invite Members']()}</Button>
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
  const [inviteEmail, setInviteEmail] = useState('');
  const [permission, setPermission] = useState(Permission.Write);
  const { trigger } = useMutation({
    mutation: inviteByEmailMutation,
  });

  const memberCount = members.length;
  const memberPanel =
    memberCount > 0 ? (
      members.map(member => (
        <MenuItem key={member.id}>
          {member.name}
          {member.email}
        </MenuItem>
      ))
    ) : (
      <div>No Members</div>
    );

  return (
    <>
      <SettingRow
        name={`${t['Members']()} (${memberCount})`}
        desc={t['Members hint']()}
      >
        <PermissionSelect value={permission} onChange={setPermission} />
      </SettingRow>
      <FlexWrapper justifyContent="space-between" alignItems="center">
        <Input
          className={style.urlButton}
          data-testid="invite-by-email-input"
          placeholder="Invite by email"
          onChange={setInviteEmail}
        />
        <Button
          size="middle"
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
              permission,
            });
          }, [inviteEmail, trigger, workspaceId, permission])}
        >
          Invite
        </Button>
      </FlexWrapper>
      <FlexWrapper flexDirection="column">{memberPanel}</FlexWrapper>
    </>
  );
};

export const MembersPanel = (props: MembersPanelProps): ReactElement | null => {
  if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <MembersPanelLocal />;
  }
  return (
    <Suspense>
      <CloudWorkspaceMembersPanel {...props} />
    </Suspense>
  );
};
