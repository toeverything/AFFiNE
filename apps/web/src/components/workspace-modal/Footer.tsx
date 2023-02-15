import { CloudWorkspaceIcon, SignOutIcon } from '@blocksuite/icons';
import { FlexWrapper } from '@affine/component';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { IconButton } from '@affine/component';
import { StyledFooter, StyleUserInfo, StyledSignInButton } from './styles';
import { useTranslation } from '@affine/i18n';
import { Tooltip } from '@affine/component';
import { useGlobalState } from '@/store/app';
export const Footer = ({
  onLogin,
  onLogout,
}: {
  onLogin: () => void;
  onLogout: () => void;
}) => {
  const user = useGlobalState(store => store.user);
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
              <SignOutIcon />
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
              <CloudWorkspaceIcon fontSize={16} />
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
