import type { DeleteCollectionInfo, PropertiesMeta } from '@affine/env/filter';
import type { GetPageInfoById } from '@affine/env/page-info';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { ViewLayersIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import clsx from 'clsx';
import { useState } from 'react';

import {
  type CollectionsCRUDAtom,
  useCollectionManager,
} from '../use-collection-manager';
import * as styles from './collection-bar.css';
import {
  type AllPageListConfig,
  EditCollectionModal,
} from './edit-collection/edit-collection';
import { useActions } from './use-action';

interface CollectionBarProps {
  getPageInfo: GetPageInfoById;
  propertiesMeta: PropertiesMeta;
  collectionsAtom: CollectionsCRUDAtom;
  backToAll: () => void;
  allPageListConfig: AllPageListConfig;
  info: DeleteCollectionInfo;
}

export const CollectionBar = (props: CollectionBarProps) => {
  const { collectionsAtom } = props;
  const t = useAFFiNEI18N();
  const setting = useCollectionManager(collectionsAtom);
  const collection = setting.currentCollection;
  const [open, setOpen] = useState(false);
  const actions = useActions({
    collection,
    setting,
    info: props.info,
    openEdit: () => setOpen(true),
  });
  return !setting.isDefault ? (
    <div
      style={{
        userSelect: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 20px',
      }}
    >
      <div>
        <div className={styles.view}>
          <EditCollectionModal
            allPageListConfig={props.allPageListConfig}
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
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'end',
        }}
      >
        <Button
          style={{ border: 'none', position: 'static' }}
          onClick={props.backToAll}
        >
          {t['com.affine.collectionBar.backToAll']()}
        </Button>
      </div>
    </div>
  ) : null;
};
