import { AuthPageContainer } from '@affine/component/auth-components';
import type { GetInviteInfoQuery } from '@affine/graphql';
import { useI18n } from '@affine/i18n';

import { Avatar } from '../../ui/avatar';
import { Button } from '../../ui/button';
import * as styles from './styles.css';
export const AcceptInvitePage = ({
  onOpenWorkspace,
  inviteInfo,
}: {
  onOpenWorkspace: () => void;
  inviteInfo: GetInviteInfoQuery['getInviteInfo'];
}) => {
  const t = useI18n();
  return (
    <AuthPageContainer
      title={t['Successfully joined!']()}
      subtitle={
        <div className={styles.content}>
          <div className={styles.userWrapper}>
            <Avatar
              url={inviteInfo.user.avatarUrl || ''}
              name={inviteInfo.user.name}
              size={20}
            />
            <span className={styles.inviteName}>{inviteInfo.user.name}</span>
          </div>
          <div>{t['invited you to join']()}</div>
          <div className={styles.userWrapper}>
            <Avatar
              url={`data:image/png;base64,${inviteInfo.workspace.avatar}`}
              name={inviteInfo.workspace.name}
              size={20}
              style={{ marginLeft: 4 }}
              colorfulFallback
            />
            <span className={styles.inviteName}>
              {inviteInfo.workspace.name}
            </span>
          </div>
        </div>
      }
    >
      <Button variant="brand" size={500} onClick={onOpenWorkspace}>
        {t['Visit Workspace']()}
      </Button>
    </AuthPageContainer>
  );
};
