import type { Collection } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { DeleteIcon, FilterIcon } from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';
import { useMemo } from 'react';

interface CollectionBarAction {
  icon: ReactNode;
  click: () => void;
  className?: string;
  name: string;
  tooltip: string;
}

export const useActions = ({
  collection,
  openEdit,
  onDelete,
}: {
  collection: Collection;
  openEdit: (open: Collection) => void;
  onDelete: () => void;
}) => {
  const t = useI18n();
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
        click: onDelete,
      },
    ];
  }, [t, onDelete, openEdit, collection]);
};
