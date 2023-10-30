import {
  createEmptyCollection,
  useCollectionManager,
  useEditCollectionName,
} from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { PlusIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import { collectionsCRUDAtom } from '../../../../atoms/collections';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../../hooks/use-navigate-helper';

export const AddCollectionButton = () => {
  const setting = useCollectionManager(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  const { node, open } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });
  const navigateHelper = useNavigateHelper();
  const [workspace] = useCurrentWorkspace();
  const handleClick = useCallback(() => {
    open('')
      .then(name => {
        const id = nanoid();
        return setting
          .createCollection(createEmptyCollection(id, { name }))
          .then(() => {
            navigateHelper.jumpToCollection(workspace.id, id);
          });
      })
      .catch(err => {
        console.error(err);
      });
  }, [navigateHelper, open, setting, workspace.id]);
  return (
    <>
      <IconButton
        data-testid="slider-bar-add-collection-button"
        onClick={handleClick}
        size="small"
      >
        <PlusIcon />
      </IconButton>
      {node}
    </>
  );
};
