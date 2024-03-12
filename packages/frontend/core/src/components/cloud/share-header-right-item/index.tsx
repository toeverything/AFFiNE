import type { PageMode } from '@toeverything/infra';
import { useState } from 'react';

import { useCurrentLoginStatus } from '../../../hooks/affine/use-current-login-status';
import { AuthenticatedItem } from './authenticated-item';
import { PresentButton } from './present';
import * as styles from './styles.css';
import { PublishPageUserAvatar } from './user-avatar';

export type ShareHeaderRightItemProps = {
  workspaceId: string;
  pageId: string;
  publishMode: PageMode;
};

const ShareHeaderRightItem = ({ ...props }: ShareHeaderRightItemProps) => {
  const loginStatus = useCurrentLoginStatus();
  const { publishMode } = props;
  const [isMember, setIsMember] = useState(false);

  // TODO: Add TOC
  return (
    <div className={styles.rightItemContainer}>
      {loginStatus === 'authenticated' ? (
        <AuthenticatedItem setIsMember={setIsMember} {...props} />
      ) : null}
      {publishMode === 'edgeless' ? <PresentButton /> : null}
      {loginStatus === 'authenticated' ? (
        <>
          <div
            className={styles.headerDivider}
            data-is-member={isMember}
            data-is-edgeless={publishMode === 'edgeless'}
          />
          <PublishPageUserAvatar />
        </>
      ) : null}
    </div>
  );
};

export default ShareHeaderRightItem;
