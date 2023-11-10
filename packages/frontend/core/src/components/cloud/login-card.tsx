import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloudWorkspaceIcon } from '@blocksuite/icons';
import { Avatar } from '@toeverything/components/avatar';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';

import { useCurrentLoginStatus } from '../../hooks/affine/use-current-login-status';
import { useCurrentUser } from '../../hooks/affine/use-current-user';
import { signInCloud } from '../../utils/cloud-utils';
import { StyledSignInButton } from '../pure/footer/styles';

export const LoginCard = () => {
  const t = useAFFiNEI18N();
  const loginStatus = useCurrentLoginStatus();

  const onSignInClick = useAsyncCallback(async () => {
    await signInCloud();
  }, []);

  if (loginStatus === 'authenticated') {
    return <UserCard />;
  }
  return (
    <StyledSignInButton data-testid="sign-in-button" onClick={onSignInClick}>
      <div className="circle">
        <CloudWorkspaceIcon />
      </div>{' '}
      {t['Sign in']()}
    </StyledSignInButton>
  );
};

const UserCard = () => {
  const user = useCurrentUser();
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <Avatar size={28} name={user.name} url={user.image} />
      <div style={{ marginLeft: '15px' }}>
        <div>{user.name}</div>
        <div>{user.email}</div>
      </div>
    </div>
  );
};
