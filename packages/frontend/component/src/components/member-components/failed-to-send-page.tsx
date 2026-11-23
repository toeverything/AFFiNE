import {
  AuthPageContainer,
  type User,
} from '@affine/component/auth-components';
import type { GetInviteInfoQuery } from '@affine/graphql';
import { Trans, useI18n } from '@affine/i18n';

import { Avatar } from '../../ui/avatar';
import * as styles from './styles.css';
export const FailedToSendPage = ({
  user,
  inviteInfo,
}: {
  user: User | null;
  inviteInfo: GetInviteInfoQuery['getInviteInfo'];
}) => {
  const t = useI18n();
  return (
    <AuthPageContainer
      title={t['com.affine.failed-to-send-request.title']()}
      subtitle={
        <div className={styles.lineHeight}>
          <Trans
            i18nKey="com.affine.failed-to-send-request.description"
            components={{
              1: (
                <div className={styles.avatarWrapper}>
                  <Avatar
                    url={`data:image/png;base64,${inviteInfo.workspace.avatar}`}
                    name={inviteInfo.workspace.name}
                    size={20}
                    colorfulFallback
                  />
                </div>
              ),
              2: <span className={styles.inviteName} />,
              3: <span className={styles.inviteName} />,
            }}
            values={{
              workspaceName: inviteInfo.workspace.name,
              userEmail: user?.email,
            }}
          />
        </div>
      }
    ></AuthPageContainer>
  );
};
