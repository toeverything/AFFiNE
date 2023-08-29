import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloudWorkspaceIcon } from '@blocksuite/icons';
import { signIn } from 'next-auth/react';
import { type CSSProperties, type FC, forwardRef, useCallback } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
// import { openDisableCloudAlertModalAtom } from '../../../atoms';
import { stringToColour } from '../../../utils';
import { StyledFooter, StyledSignInButton } from './styles';
export const Footer: FC = () => {
  const loginStatus = useCurrentLoginStatus();

  // const setOpen = useSetAtom(openDisableCloudAlertModalAtom);
  return (
    <StyledFooter data-testid="workspace-list-modal-footer">
      {loginStatus === 'authenticated' ? null : <SignInButton />}
    </StyledFooter>
  );
};

const SignInButton = () => {
  const t = useAFFiNEI18N();

  return (
    <StyledSignInButton
      data-testid="sign-in-button"
      onClick={useCallback(() => {
        signIn().catch(console.error);
      }, [])}
    >
      <div className="circle">
        <CloudWorkspaceIcon />
      </div>

      {t['Sign in']()}
    </StyledSignInButton>
  );
};

interface WorkspaceAvatarProps {
  size: number;
  name: string | undefined;
  avatar: string | undefined;
  style?: CSSProperties;
}

export const WorkspaceAvatar = forwardRef<HTMLDivElement, WorkspaceAvatarProps>(
  function WorkspaceAvatar(props, ref) {
    const size = props.size || 20;
    const sizeStr = size + 'px';

    return (
      <>
        {props.avatar ? (
          <div
            style={{
              ...props.style,
              width: sizeStr,
              height: sizeStr,
              color: '#fff',
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
            ref={ref}
          >
            <picture>
              <img
                style={{ width: sizeStr, height: sizeStr }}
                src={props.avatar}
                alt=""
                referrerPolicy="no-referrer"
              />
            </picture>
          </div>
        ) : (
          <div
            style={{
              ...props.style,
              width: sizeStr,
              height: sizeStr,
              border: '1px solid #fff',
              color: '#fff',
              fontSize: Math.ceil(0.5 * size) + 'px',
              background: stringToColour(props.name || 'AFFiNE'),
              borderRadius: '50%',
              textAlign: 'center',
              lineHeight: size + 'px',
              display: 'inline-block',
              verticalAlign: 'middle',
            }}
            ref={ref}
          >
            {(props.name || 'AFFiNE').substring(0, 1)}
          </div>
        )}
      </>
    );
  }
);
