import type { PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ViewLayersIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useState } from 'react';

import {
  type CollectionsAtom,
  useCollectionManager,
} from '../use-collection-manager';
import * as styles from './collection-bar.css';
import { EditCollectionModal } from './create-collection';
import { useActions } from './use-action';

interface CollectionBarProps {
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  collectionsAtom: CollectionsAtom;
  columnsCount: number;
}

export const CollectionBar = (props: CollectionBarProps) => {
  const { getPageInfo, propertiesMeta, columnsCount, collectionsAtom } = props;
  const t = useAFFiNEI18N();
  const setting = useCollectionManager(collectionsAtom);
  const collection = setting.currentCollection;
  const [open, setOpen] = useState(false);
  const actions = useActions({
    collection,
    setting,
    openEdit: () => setOpen(true),
  });

  return !setting.isDefault ? (
    <tr style={{ userSelect: 'none' }}>
      <td>
        <div className={styles.view}>
          <EditCollectionModal
            propertiesMeta={propertiesMeta}
            getPageInfo={getPageInfo}
            init={collection}
            open={open}
            onOpenChange={setOpen}
            // eslint-disable-next-line @typescript-eslint/no-misused-promises
            onConfirm={setting.updateCollection}
          />
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
          {t['com.affine.collectionBar.backToAll']()}
        </Button>
      </td>
    </tr>
  ) : null;
};
