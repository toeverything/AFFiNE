import { Button } from '@affine/component/ui/button';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService, WorkspaceManager } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';

import type { ShareHeaderRightItemProps } from './index';
import * as styles from './styles.css';

export const AuthenticatedItem = ({
  setIsMember,
  ...props
}: { setIsMember: (value: boolean) => void } & ShareHeaderRightItemProps) => {
  const { workspaceId, pageId } = props;

  const workspaceManager = useService(WorkspaceManager);
  const workspaceList = useLiveData(workspaceManager.list.workspaceList$);
  const isMember = workspaceList?.some(
    workspace => workspace.id === workspaceId
  );
  const t = useAFFiNEI18N();
  const { jumpToPage } = useNavigateHelper();

  const handleEdit = useCallback(() => {
    jumpToPage(workspaceId, pageId);
  }, [workspaceId, pageId, jumpToPage]);

  useEffect(() => {
    if (isMember) {
      setIsMember(true);
    }
  }, [isMember, setIsMember]);

  if (isMember) {
    return (
      <Button
        className={styles.editButton}
        onClick={handleEdit}
        data-testid="share-page-edit-button"
      >
        {t['Edit']()}
      </Button>
    );
  }

  return null;
};
