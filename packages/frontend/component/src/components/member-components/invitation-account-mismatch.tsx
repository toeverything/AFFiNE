import {
  AuthPageContainer,
  type User,
} from '@affine/component/auth-components';
import { useI18n } from '@affine/i18n';

import { Avatar } from '../../ui/avatar';
import { Button } from '../../ui/button';
import * as styles from './styles.css';

export const InvitationAccountMismatchPage = ({
  user,
  switchingAccount,
  onSwitchAccount,
  onOpenAffine,
}: {
  user: User | null;
  switchingAccount: boolean;
  onSwitchAccount: () => void;
  onOpenAffine: () => void;
}) => {
  const t = useI18n();

  return (
    <AuthPageContainer
      title={t['com.affine.invitation.account-mismatch.title']()}
      subtitle={t['com.affine.invitation.account-mismatch.description']()}
    >
      {user ? (
        <div className={styles.currentAccount}>
          <Avatar url={user.avatar ?? user.image} name={user.label} />
          <span>{user.email}</span>
        </div>
      ) : null}
      <div className={styles.accountMismatchActions}>
        <Button
          variant="primary"
          size="large"
          loading={switchingAccount}
          disabled={switchingAccount}
          onClick={onSwitchAccount}
          block
        >
          {t['com.affine.invitation.account-mismatch.switch-account']()}
        </Button>
        <Button size="large" onClick={onOpenAffine} block>
          {t['com.affine.invitation.account-mismatch.back-to-affine']()}
        </Button>
      </div>
    </AuthPageContainer>
  );
};
