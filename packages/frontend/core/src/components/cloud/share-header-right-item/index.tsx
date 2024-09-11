import { AuthService } from '@affine/core/modules/cloud';
import type { DocMode } from '@blocksuite/blocks';
import { useLiveData, useService } from '@toeverything/infra';

import { ImportTemplateButton } from './import-template';
import { PresentButton } from './present';
import { SignIn } from './sign-in';
import * as styles from './styles.css';
import { PublishPageUserAvatar } from './user-avatar';

export type ShareHeaderRightItemProps = {
  workspaceId: string;
  docId: string;
  publishMode: DocMode;
  isTemplate?: boolean;
  templateName?: string;
};

const ShareHeaderRightItem = ({
  publishMode,
  isTemplate,
  templateName,
  workspaceId,
  docId,
}: ShareHeaderRightItemProps) => {
  const loginStatus = useLiveData(useService(AuthService).session.status$);
  const authenticated = loginStatus === 'authenticated';
  return (
    <div className={styles.rightItemContainer}>
      {isTemplate ? (
        <ImportTemplateButton
          docId={docId}
          workspaceId={workspaceId}
          name={templateName ?? ''}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
};

export default ShareHeaderRightItem;
