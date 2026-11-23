import {
  AuthPageContainer,
  type User,
} from '@affine/component/auth-components';
import {
  type GetInviteInfoQuery,
  WorkspaceMemberStatus,
} from '@affine/graphql';
import { useI18n } from '@affine/i18n';
import { SignOutIcon } from '@blocksuite/icons/rc';

import { Avatar } from '../../ui/avatar';
import { Button, IconButton } from '../../ui/button';
import * as styles from './styles.css';
export const RequestToJoinPage = ({
  user,
  inviteInfo,
  requestToJoin,
  onSignOut,
}: {
  user: User | null;
  inviteInfo?: GetInviteInfoQuery['getInviteInfo'];
  requestToJoin: () => void;
  onSignOut: () => void;
}) => {
  const t = useI18n();

  return (
    <AuthPageContainer
      subtitle={
        <div className={styles.content}>
          <div className={styles.userWrapper}>
            <Avatar
              url={inviteInfo?.user.avatarUrl || ''}
              name={inviteInfo?.user.name}
              size={20}
            />
            <span className={styles.inviteName}>{inviteInfo?.user.name}</span>
          </div>
          <div>{t['invited you to join']()}</div>
          <div className={styles.userWrapper}>
            <Avatar
              url={`data:image/png;base64,${inviteInfo?.workspace.avatar}`}
              name={inviteInfo?.workspace.name}
              size={20}
              style={{ marginLeft: 4 }}
              colorfulFallback
            />
            <span className={styles.inviteName}>
              {inviteInfo?.workspace.name}
            </span>
          </div>
        </div>
      }
    >
      <Button variant="primary" size="large" onClick={requestToJoin}>
        {inviteInfo?.status === WorkspaceMemberStatus.Pending
          ? t['com.affine.notification.invitation.accept']()
          : t['com.affine.request-to-join-workspace.button']()}
      </Button>
      {user ? (
        <div className={styles.userInfoWrapper}>
          <Avatar url={user.avatar ?? user.image} name={user.label} />
          <span>{user.email}</span>
          <IconButton
            onClick={onSignOut}
            size="20"
            tooltip={t['404.signOut']()}
          >
            <SignOutIcon />
          </IconButton>
        </div>
      ) : null}
    </AuthPageContainer>
  );
};
