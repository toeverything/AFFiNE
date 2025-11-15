import { Avatar } from '@affine/component';
import { AuthService } from '@affine/core/modules/cloud';
import { useLiveData, useService } from '@toeverything/infra';

import * as styles from './index.css';

export const Account = () => {
  const account = useLiveData(useService(AuthService).session.account$);
  if (!account) {
    // TODO(@JimmFly): loading ui
    return null;
  }
  return (
    <div data-testid="user-info-card" className={styles.account}>
      <Avatar
        size={28}
        rounded={50}
        name={account.label}
        url={account.avatar}
      />

      <div className={styles.content}>
        <div
          className={styles.name}
          title={account.label}
          content={account.label}
        >
          {account.label}
        </div>
        <div
          className={styles.email}
          title={account.email}
          content={account.email}
        >
          {account.email}
        </div>
      </div>
    </div>
  );
};
