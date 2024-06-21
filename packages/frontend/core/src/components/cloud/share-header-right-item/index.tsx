import { AuthService } from '@affine/core/modules/cloud';
import { type DocMode, useLiveData, useService } from '@toeverything/infra';
import { useState } from 'react';

import { AuthenticatedItem } from './authenticated-item';
import { PresentButton } from './present';
import * as styles from './styles.css';
import { PublishPageUserAvatar } from './user-avatar';

export type ShareHeaderRightItemProps = {
  workspaceId: string;
  pageId: string;
  publishMode: DocMode;
};

const ShareHeaderRightItem = ({ ...props }: ShareHeaderRightItemProps) => {
  const loginStatus = useLiveData(useService(AuthService).session.status$);
  const { publishMode } = props;
  const [isMember, setIsMember] = useState(false);

  // TODO(@JimmFly): Add TOC
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
