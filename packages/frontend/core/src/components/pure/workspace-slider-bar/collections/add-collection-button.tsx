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

export const AddCollectionButton = () => {
  const setting = useCollectionManager(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  const { node, open } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });
  const handleClick = useCallback(() => {
    open('')
      .then(name => {
        return setting.createCollection(
          createEmptyCollection(nanoid(), { name })
        );
      })
      .catch(err => {
        console.error(err);
      });
  }, [open, setting]);
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
