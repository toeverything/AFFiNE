import { AuthPageContainer } from '@affine/component/auth-components';
import { type GetInviteInfoQuery } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Avatar } from '@toeverything/components/avatar';
import { Button } from '@toeverything/components/button';

import { FlexWrapper } from '../../ui/layout';
import * as styles from './styles.css';
export const AcceptInvitePage = ({
  onOpenWorkspace,
  inviteInfo,
}: {
  onOpenWorkspace: () => void;
  inviteInfo: GetInviteInfoQuery['getInviteInfo'];
}) => {
  const t = useAFFiNEI18N();
  return (
    <AuthPageContainer
      title={t['Successfully joined!']()}
      subtitle={
        <FlexWrapper alignItems="center">
          <Avatar
            url={inviteInfo.user.avatarUrl || ''}
            name={inviteInfo.user.name}
            size={20}
            // FIXME: fix it in @toeverything/components/avatar
            imageProps={{
              style: {
                objectFit: 'cover',
              },
            }}
          />
          <span className={styles.inviteName}>{inviteInfo.user.name}</span>
          {t['invited you to join']()}
          <Avatar
            url={`data:image/png;base64,${inviteInfo.workspace.avatar}`}
            name={inviteInfo.workspace.name}
            size={20}
            style={{ marginLeft: 4 }}
            colorfulFallback={true}
          />
          <span className={styles.inviteName}>{inviteInfo.workspace.name}</span>
        </FlexWrapper>
      }
    >
      <Button type="primary" size="large" onClick={onOpenWorkspace}>
        {t['Visit Workspace']()}
      </Button>
    </AuthPageContainer>
  );
};
