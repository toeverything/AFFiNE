import type { Collection } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  FilterIcon,
  PinedIcon,
  PinIcon,
  UnpinIcon,
} from '@blocksuite/icons';
import { type ReactNode, useMemo } from 'react';

import type { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-bar.css';

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
}: {
  collection: Collection;
  setting: ReturnType<typeof useCollectionManager>;
  openEdit: (open: Collection) => void;
}) => {
  const t = useAFFiNEI18N();
  return useMemo<CollectionBarAction[]>(() => {
    return [
      {
        icon: (
          <>
            {collection.pinned ? (
              <PinedIcon className={styles.pinedIcon}></PinedIcon>
            ) : (
              <PinIcon className={styles.pinedIcon}></PinIcon>
            )}
            {collection.pinned ? (
              <UnpinIcon className={styles.pinIcon}></UnpinIcon>
            ) : (
              <PinIcon className={styles.pinIcon}></PinIcon>
            )}
          </>
        ),
        name: 'pin',
        tooltip: collection.pinned
          ? t['com.affine.collection-bar.action.tooltip.unpin']()
          : t['com.affine.collection-bar.action.tooltip.pin'](),
        className: styles.pin,
        click: () => {
          setting
            .updateCollection({
              ...collection,
              pinned: !collection.pinned,
            })
            .catch(err => {
              console.error(err);
            });
        },
      },
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
          setting.deleteCollection(collection.id).catch(err => {
            console.error(err);
          });
        },
      },
    ];
  }, [collection, t, setting, openEdit]);
};
