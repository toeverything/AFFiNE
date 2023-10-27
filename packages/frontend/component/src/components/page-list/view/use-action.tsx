import type { Collection, DeleteCollectionInfo } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, FilterIcon } from '@blocksuite/icons';
import { type ReactNode, useMemo } from 'react';

import type { useCollectionManager } from '../use-collection-manager';

interface CollectionBarAction {
  icon: ReactNode;
  click: () => void;
  className?: string;
  name: string;
  tooltip: string;
}

export const useActions = ({
  collection,
  setting,
  openEdit,
  info,
}: {
  info: DeleteCollectionInfo;
  collection: Collection;
  setting: ReturnType<typeof useCollectionManager>;
  openEdit: (open: Collection) => void;
}) => {
  const t = useAFFiNEI18N();
  return useMemo<CollectionBarAction[]>(() => {
    return [
      {
        icon: <FilterIcon />,
        name: 'edit',
        tooltip: t['com.affine.collection-bar.action.tooltip.edit'](),
        click: () => {
          openEdit(collection);
        },
      },
      {
        icon: <DeleteIcon style={{ color: 'var(--affine-error-color)' }} />,
        name: 'delete',
        tooltip: t['com.affine.collection-bar.action.tooltip.delete'](),
        click: () => {
          setting.deleteCollection(info, collection.id).catch(err => {
            console.error(err);
          });
        },
      },
    ];
  }, [info, collection, t, setting, openEdit]);
};
