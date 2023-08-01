import { UserAvatar } from '@affine/component/user-avatar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloudWorkspaceIcon } from '@blocksuite/icons';
import { signIn } from 'next-auth/react';
import type { FC } from 'react';

import { type User, useUserAtom } from '../../atoms/user';
import { StyledSignInButton } from '../pure/footer/styles';

export const LoginCard = () => {
  const t = useAFFiNEI18N();
  const { user } = useUserAtom();
  if (user) {
    return <UserCard user={user} />;
  }
  return (
    <StyledSignInButton
      data-testid="sign-in-button"
      onClick={async () => {
        // jump to login page
        signIn().catch(console.error);
      }}
    >
      <div className="circle">
        <CloudWorkspaceIcon />
      </div>{' '}
      {t['Sign in']()}
    </StyledSignInButton>
  );
};

const UserCard: FC<{ user: User }> = ({ user }) => {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <UserAvatar
        size={28}
        name={user.name}
        url={user.avatarUrl}
        className="avatar"
      />
      <div style={{ marginLeft: '15px' }}>
        <div>{user.name}</div>
        <div>{user.email}</div>
      </div>
    </div>
  );
};
