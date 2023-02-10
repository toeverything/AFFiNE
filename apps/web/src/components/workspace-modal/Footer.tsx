import { CloudInsyncIcon, LogOutIcon } from '@blocksuite/icons';
import { FlexWrapper } from '@affine/component';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { IconButton } from '@affine/component';
import { useAppState } from '@/providers/app-state-provider';
import { StyledFooter, StyleUserInfo, StyledSignInButton } from './styles';
import { useTranslation } from '@affine/i18n';
import { Tooltip } from '@affine/component';
export const Footer = ({
  onLogin,
  onLogout,
}: {
  onLogin: () => void;
  onLogout: () => void;
}) => {
  const { user } = useAppState();
  const { t } = useTranslation();

  return (
    <StyledFooter>
      {user && (
        <>
          <FlexWrapper>
            <WorkspaceAvatar
              size={40}
              name={user.name}
              avatar={user.avatar}
            ></WorkspaceAvatar>
            <StyleUserInfo>
              <p>{user.name}</p>
              <p>{user.email}</p>
            </StyleUserInfo>
          </FlexWrapper>
          <Tooltip content={t('Sign out')} disablePortal={true}>
            <IconButton
              onClick={() => {
                onLogout();
              }}
            >
              <LogOutIcon />
            </IconButton>
          </Tooltip>
        </>
      )}

      {!user && (
        <StyledSignInButton
          noBorder
          bold
          icon={
            <div className="circle">
              <CloudInsyncIcon fontSize={16} />
            </div>
          }
          onClick={async () => {
            onLogin();
          }}
        >
          {t('Sign in')}
        </StyledSignInButton>
      )}
    </StyledFooter>
  );
};
