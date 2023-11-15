import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';

import { useCurrentUser } from '../../../hooks/affine/use-current-user';
import { useMembers } from '../../../hooks/affine/use-members';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import type { ShareHeaderRightItemProps } from '.';

export const AuthenticatedItem = ({ ...props }: ShareHeaderRightItemProps) => {
  const { workspaceId, pageId } = props;
  const user = useCurrentUser();
  const members = useMembers(workspaceId, 0);
  const isMember = members.some(m => m.id === user.id);
  const t = useAFFiNEI18N();
  const { jumpToPage } = useNavigateHelper();

  if (isMember) {
    return (
      <Button
        type="plain"
        onClick={() => jumpToPage(workspaceId, pageId)}
        data-testid="share-page-edit-button"
      >
        {t['Edit']()}
      </Button>
    );
  }

  return null;
};
