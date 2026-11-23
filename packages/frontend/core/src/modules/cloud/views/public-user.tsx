import { Avatar, Tooltip } from '@affine/component';
import { useCurrentServerService } from '@affine/core/components/providers/current-server-scope';
import { useI18n } from '@affine/i18n';
import { useLiveData } from '@toeverything/infra';
import {
  type ComponentType,
  type CSSProperties,
  useLayoutEffect,
  useMemo,
} from 'react';

import { PublicUserService } from '../services/public-user';
import * as styles from './public-user.css';

export const PublicUserLabel = ({
  id,
  size = 20,
  showName = true,
  tooltip: NameTip,
  align = 'baseline',
}: {
  id: string;
  size?: number;
  showName?: boolean;
  tooltip?: ComponentType<{ userName: string }>;
  align?: CSSProperties['alignItems'];
}) => {
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
    return showName ? (
      <span className={styles.publicUserLabelRemoved}>
        {t['Unknown User']()}
      </span>
    ) : (
      <Avatar
        size={size}
        name={t['Unknown User']()}
        className={styles.publicUserLabelAvatar}
      />
    );
  }

  return (
    <Tooltip
      content={
        NameTip ? (
          <NameTip userName={user?.name || t['Unknown User']()} />
        ) : null
      }
    >
      <span className={styles.publicUserLabel} style={{ alignItems: align }}>
        <Avatar
          url={user?.avatar}
          name={user?.name ?? ''}
          size={size}
          className={styles.publicUserLabelAvatar}
          data-show-name={showName}
        />
        {showName && user?.name}
      </span>
    </Tooltip>
  );
};
