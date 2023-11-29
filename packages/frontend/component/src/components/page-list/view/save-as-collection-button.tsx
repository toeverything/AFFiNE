import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { SaveIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import { createEmptyCollection } from '../use-collection-manager';
import { useEditCollectionName } from './use-edit-collection';

interface SaveAsCollectionButtonProps {
  onConfirm: (collection: Collection) => Promise<void>;
}

export const SaveAsCollectionButton = ({
  onConfirm,
}: SaveAsCollectionButtonProps) => {
  const t = useAFFiNEI18N();
  const { open, node } = useEditCollectionName({
    title: t['com.affine.editCollection.saveCollection'](),
    showTips: true,
  });
  const handleClick = useCallback(() => {
    open('')
      .then(name => {
        return onConfirm(createEmptyCollection(nanoid(), { name }));
      })
      .catch(err => {
        console.error(err);
      });
  }, [open, onConfirm]);
  return (
    <>
      <Button
        onClick={handleClick}
        data-testid="save-as-collection"
        icon={<SaveIcon />}
        size="large"
        style={{ padding: '7px 8px' }}
      >
        {t['com.affine.editCollection.saveCollection']()}
      </Button>
      {node}
    </>
  );
};
