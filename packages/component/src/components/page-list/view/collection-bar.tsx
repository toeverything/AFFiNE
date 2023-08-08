import { Tooltip } from '@affine/component';
import { EditCollectionModel } from '@affine/component/page-list';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  DeleteIcon,
  FilterIcon,
  PinedIcon,
  PinIcon,
  UnpinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import clsx from 'clsx';
import type { ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

import { Button } from '../../../ui/button/button';
import { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-bar.css';

interface CollectionBarProps {
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  columnsCount: number;
  workspaceId: string;
}

interface CollectionBarAction {
  icon: ReactNode;
  click: () => void;
  className?: string;
  name: string;
  tooltip: string;
}

export const CollectionBar = (props: CollectionBarProps) => {
  const { getPageInfo, propertiesMeta, columnsCount, workspaceId } = props;
  const t = useAFFiNEI18N();
  const setting = useCollectionManager(workspaceId);
  const collection = setting.currentCollection;
  const [open, setOpen] = useState(false);
  const actions = useMemo<CollectionBarAction[]>(
    () => [
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
          setOpen(true);
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
    ],
    [collection, t, setting]
  );
  const onClose = useCallback(() => setOpen(false), []);

  return !setting.isDefault ? (
    <tr style={{ userSelect: 'none' }}>
      <td>
        <div className={styles.view}>
          <EditCollectionModel
            propertiesMeta={propertiesMeta}
            getPageInfo={getPageInfo}
            init={collection}
            open={open}
            onClose={onClose}
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onConfirm={setting.updateCollection}
          ></EditCollectionModel>
          <ViewLayersIcon
            style={{
              height: 20,
              width: 20,
            }}
          />
          <Tooltip
            content={setting.currentCollection.name}
            pointerEnterDelay={1500}
          >
            <div
              style={{
                marginRight: 10,
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {setting.currentCollection.name}
            </div>
          </Tooltip>
          {actions.map(action => {
            return (
              <Tooltip
                key={action.name}
                content={action.tooltip}
                placement="top-start"
              >
                <div
                  data-testid={`collection-bar-option-${action.name}`}
                  onClick={action.click}
                  className={clsx(styles.option, action.className)}
                >
                  {action.icon}
                </div>
              </Tooltip>
            );
          })}
        </div>
      </td>
      {Array.from({ length: columnsCount - 2 }).map((_, i) => (
        <td key={i}></td>
      ))}
      <td
        style={{
          display: 'flex',
          justifyContent: 'end',
        }}
      >
        <Button
          style={{ border: 'none', position: 'static' }}
          onClick={() => setting.backToAll()}
        >
          {t['Back to all']()}
        </Button>
      </td>
    </tr>
  ) : null;
};
