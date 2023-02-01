import { CloudInsyncIcon, LogOutIcon } from '@blocksuite/icons';
import { FlexWrapper } from '@/ui/layout';
import { WorkspaceAvatar } from '@/components/workspace-avatar';
import { IconButton } from '@/ui/button';
import { useAppState } from '@/providers/app-state-provider';
import { StyledFooter, StyleUserInfo, StyleSignIn } from './styles';

export const Footer = ({
  onLogin,
  onLogout,
}: {
  onLogin: () => void;
  onLogout: () => void;
}) => {
  const { user } = useAppState();

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
          Sign in to sync with AFFINE Cloud
        </StyleSignIn>
      )}
    </StyledFooter>
  );
};
