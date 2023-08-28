import { EditCollectionModel } from '@affine/component/page-list';
import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ViewLayersIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useCallback, useState } from 'react';

import { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-bar.css';
import { useActions } from './use-action';

interface CollectionBarProps {
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  columnsCount: number;
  workspaceId: string;
}

export const CollectionBar = (props: CollectionBarProps) => {
  const { getPageInfo, propertiesMeta, columnsCount, workspaceId } = props;
  const t = useAFFiNEI18N();
  const setting = useCollectionManager(workspaceId);
  const collection = setting.currentCollection;
  const [open, setOpen] = useState(false);
  const actions = useActions({
    collection,
    setting,
    openEdit: () => setOpen(true),
  });
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
            rootOptions={{
              delayDuration: 1500,
            }}
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
              <Tooltip key={action.name} content={action.tooltip}>
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
