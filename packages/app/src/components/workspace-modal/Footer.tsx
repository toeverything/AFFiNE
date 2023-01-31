import { CloudInsyncIcon, LogOutIcon } from '@blocksuite/icons';
import { Wrapper } from '@/ui/layout';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { IconButton } from '@/ui/button';
import { useAppState } from '@/providers/app-state-provider';
import { StyledFooter, StyleUserInfo, StyleSignIn } from './styles';
import { useTranslation } from '@affine/i18n';

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
          <Wrapper>
            <WorkspaceAvatar
              size={40}
              name={user.name}
              avatar={user.avatar}
            ></WorkspaceAvatar>
            <StyleUserInfo>
              <p>{user.name}</p>
              <p>{user.email}</p>
            </StyleUserInfo>
          </Wrapper>
          <IconButton
            onClick={() => {
              onLogout();
            }}
          >
            <LogOutIcon />
          </IconButton>
        </>
      )}

      {!user && (
        <StyleSignIn
          onClick={async () => {
            onLogin();
          }}
        >
          <span>
            <CloudInsyncIcon fontSize={16} />
          </span>
          {t('Sign in')}
        </StyleSignIn>
      )}
    </StyledFooter>
  );
};
