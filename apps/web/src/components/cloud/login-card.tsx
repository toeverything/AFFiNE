import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { CloudWorkspaceIcon } from '@blocksuite/icons';
import { signIn, useSession } from 'next-auth/react';
import { useEffect } from 'react';

import { StyledSignInButton } from '../pure/footer/styles';

export const LoginCard = () => {
  const t = useAFFiNEI18N();
  const session = useSession();
  useEffect(() => {
    // fixme: remove debug log in the future
    console.log('session', session);
  }, [session]);
  if (session.status === 'authenticated') {
    return <UserCard />;
  }
  return (
    <StyledSignInButton
      data-testid="sign-in-button"
      noBorder
      bold
      icon={
        <div className="circle">
          <CloudWorkspaceIcon />
        </div>
      }
      onClick={async () => {
        // jump to login page
        signIn().catch(console.error);
      }}
    >
      {t['Sign in']()}
    </StyledSignInButton>
  );
};

const UserCard = () => {
  const session = useSession();
  const user = session.data?.user;
  assertExists(user);
  return (
    <div>
      <img alt="user avatar" src={user.image as string} />
      <div>{user.name}</div>
      <div>{user.email}</div>
    </div>
  );
};
