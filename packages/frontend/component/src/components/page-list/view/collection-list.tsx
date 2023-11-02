import type {
  Collection,
  DeleteCollectionInfo,
  Filter,
} from '@affine/env/filter';
import type { PropertiesMeta } from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilteredIcon } from '@blocksuite/icons';
import { Button } from '@toeverything/components/button';
import { Menu } from '@toeverything/components/menu';
import { useCallback, useState } from 'react';

import { FlexWrapper } from '../../../ui/layout';
import { CreateFilterMenu } from '../filter/vars';
import type { useCollectionManager } from '../use-collection-manager';
import * as styles from './collection-list.css';
import { CollectionOperations } from './collection-operations';
import {
  type AllPageListConfig,
  EditCollectionModal,
} from './edit-collection/edit-collection';

export const CollectionList = ({
  setting,
  propertiesMeta,
  allPageListConfig,
  userInfo,
}: {
  setting: ReturnType<typeof useCollectionManager>;
  propertiesMeta: PropertiesMeta;
  allPageListConfig: AllPageListConfig;
  userInfo: DeleteCollectionInfo;
}) => {
  const t = useAFFiNEI18N();
  const [collection, setCollection] = useState<Collection>();
  const onChange = useCallback(
    (filterList: Filter[]) => {
      setting
        .updateCollection({
          ...setting.currentCollection,
          filterList,
        })
        .catch(err => {
          console.error(err);
        });
    },
    [setting]
  );
  const closeUpdateCollectionModal = useCallback((open: boolean) => {
    if (!open) {
      setCollection(undefined);
    }
  }, []);

  const onConfirm = useCallback(
    async (view: Collection) => {
      await setting.updateCollection(view);
      closeUpdateCollectionModal(false);
    },
    [closeUpdateCollectionModal, setting]
  );
  return (
    <FlexWrapper alignItems="center">
      {setting.isDefault ? (
        <>
          <Menu
            items={
              <CreateFilterMenu
                propertiesMeta={propertiesMeta}
                value={setting.currentCollection.filterList}
                onChange={onChange}
              />
            }
          >
            <Button
              className={styles.filterMenuTrigger}
              type="default"
              icon={<FilteredIcon />}
              data-testid="create-first-filter"
            >
              {t['com.affine.filter']()}
            </Button>
          </Menu>
          <EditCollectionModal
            allPageListConfig={allPageListConfig}
            init={collection}
            open={!!collection}
            onOpenChange={closeUpdateCollectionModal}
            onConfirm={onConfirm}
          />
        </>
      ) : (
        <CollectionOperations
          info={userInfo}
          collection={setting.currentCollection}
          config={allPageListConfig}
          setting={setting}
        >
          <Button
            className={styles.filterMenuTrigger}
            type="default"
            icon={<FilteredIcon />}
            data-testid="create-first-filter"
          >
            {t['com.affine.filter']()}
          </Button>
        </CollectionOperations>
      )}
    </FlexWrapper>
  );
};
