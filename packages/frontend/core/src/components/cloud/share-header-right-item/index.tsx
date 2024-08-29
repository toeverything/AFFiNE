import { AuthService } from '@affine/core/modules/cloud';
import { type DocMode, useLiveData, useService } from '@toeverything/infra';

import { PresentButton } from './present';
import { SignIn } from './sign-in';
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
  const authenticated = loginStatus === 'authenticated';
  return (
    <div className={styles.rightItemContainer}>
      {authenticated ? null : <SignIn />}
      {publishMode === 'edgeless' ? <PresentButton /> : null}
      {authenticated ? (
        <>
          <div
            className={styles.headerDivider}
            data-authenticated={true}
            data-is-edgeless={publishMode === 'edgeless'}
          />
          <PublishPageUserAvatar />
        </>
      ) : null}
    </div>
  );
};

export default ShareHeaderRightItem;
