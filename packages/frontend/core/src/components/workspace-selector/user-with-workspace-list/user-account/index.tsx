import { UserPlanButton } from '@affine/core/components/affine/auth/user-plan-button';

import * as styles from './index.css';

export const UserAccountItem = ({
  email,
}: {
  email: string;
  onEventEnd?: () => void;
}) => {
  return (
    <div className={styles.userAccountContainer}>
      <div className={styles.leftContainer}>
        <div className={styles.userEmail}>{email}</div>
      </div>
      <UserPlanButton />
    </div>
  );
};
