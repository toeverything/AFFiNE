import {
  CreateCollectionModal,
  createEmptyCollection,
  useCollectionManager,
} from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { PlusIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { collectionsCRUDAtom } from '../../../../atoms/collections';

export const AddCollectionButton = () => {
  const setting = useCollectionManager(collectionsCRUDAtom);
  const t = useAFFiNEI18N();
  const [show, showUpdateCollection] = useState(false);
  const handleClick = useCallback(() => {
    showUpdateCollection(true);
  }, [showUpdateCollection]);
  const createCollection = useCallback(
    (title: string) => {
      return setting.createCollection(
        createEmptyCollection(nanoid(), { name: title })
      );
    },
    [setting]
  );
  return (
    <>
      <IconButton
        data-testid="slider-bar-add-collection-button"
        onClick={handleClick}
        size="small"
      >
        <PlusIcon />
      </IconButton>

      <CreateCollectionModal
        onConfirm={createCollection}
        open={show}
        onOpenChange={showUpdateCollection}
        title={t['com.affine.editCollection.createCollection']()}
        init=""
      />
    </>
  );
};
