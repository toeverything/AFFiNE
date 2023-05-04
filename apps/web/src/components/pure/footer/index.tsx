import { FlexWrapper } from '@affine/component';
import { IconButton } from '@affine/component';
import { Tooltip } from '@affine/component';
import { config } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { AccessTokenMessage } from '@affine/workspace/affine/login';
import { CloudWorkspaceIcon, SignOutIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai';
import type { CSSProperties } from 'react';
import type React from 'react';
import { forwardRef } from 'react';

import { openDisableCloudAlertModalAtom } from '../../../atoms';
import { stringToColour } from '../../../utils';
import { StyledFooter, StyledSignInButton, StyleUserInfo } from './styles';

export type FooterProps = {
  user: AccessTokenMessage | null;
  onLogin: () => void;
  onLogout: () => void;
};

export const Footer: React.FC<FooterProps> = ({ user, onLogin, onLogout }) => {
  const t = useAFFiNEI18N();
  const setOpen = useSetAtom(openDisableCloudAlertModalAtom);
  return (
    <StyledFooter data-testid="workspace-list-modal-footer">
      {user && (
        <>
          <FlexWrapper>
            <WorkspaceAvatar
              size={40}
              name={user.name}
              avatar={user.avatar_url}
            ></WorkspaceAvatar>
            <StyleUserInfo>
              <p>{user.name}</p>
              <p>{user.email}</p>
            </StyleUserInfo>
          </FlexWrapper>
          <Tooltip content={t['Sign out']()} disablePortal={true}>
            <IconButton
              data-testid="workspace-list-modal-sign-out"
              onClick={() => {
                onLogout();
              }}
            >
              <SignOutIcon />
            </IconButton>
          </Tooltip>
        </>
      )}

      {!user && (
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
            if (!config.enableLegacyCloud) {
              setOpen(true);
            } else {
              onLogin();
            }
          }}
        >
          {t['Sign in']()}
        </StyledSignInButton>
      )}
    </StyledFooter>
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
