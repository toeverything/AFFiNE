import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloudWorkspaceIcon } from '@blocksuite/icons';

import { StyledSignInButton } from '../pure/footer/styles';

export const LoginCard = () => {
  const t = useAFFiNEI18N();
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
      }}
    >
      {t['Sign in']()}
    </StyledSignInButton>
  );
};
