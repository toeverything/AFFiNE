import { Avatar } from '@affine/component';
import { useCurrentServerService } from '@affine/core/components/providers/current-server-scope';
import { useI18n } from '@affine/i18n';
import { useLiveData } from '@toeverything/infra';
import { useLayoutEffect, useMemo } from 'react';

import { PublicUserService } from '../services/public-user';
import * as styles from './public-user.css';

export const PublicUserLabel = ({ id }: { id: string }) => {
  const serverService = useCurrentServerService();
  const publicUser = useMemo(() => {
    return serverService?.scope.get(PublicUserService);
  }, [serverService]);

  useLayoutEffect(() => {
    if (publicUser) {
      publicUser.revalidate(id);
    }
  }, [id, publicUser]);

  const user = useLiveData(publicUser?.publicUser$(id));
  const isLoading = useLiveData(publicUser?.isLoading$(id));
  const t = useI18n();

  if (isLoading && !user) {
    return <span className={styles.publicUserLabelLoading}>...</span>;
  }

  if (user?.removed) {
    return (
      <span className={styles.publicUserLabelRemoved}>
        {t['Unknown User']()}
      </span>
    );
  }

  return (
    <span className={styles.publicUserLabel}>
      <Avatar
        url={user?.avatar}
        name={user?.name ?? ''}
        size={20}
        className={styles.publicUserLabelAvatar}
      />
      {user?.name}
    </span>
  );
};
