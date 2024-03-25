import { Button, FlexWrapper, Menu } from '@affine/component';
import type {
  Collection,
  DeleteCollectionInfo,
  Filter,
  PropertiesMeta,
} from '@affine/env/filter';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilterIcon } from '@blocksuite/icons';

import { CreateFilterMenu } from '../filter/vars';
import * as styles from './collection-list.css';
import { CollectionOperations } from './collection-operations';
import type { AllPageListConfig } from './edit-collection/edit-collection';

export const CollectionPageListOperationsMenu = ({
  collection,
  allPageListConfig,
  userInfo,
}: {
  collection: Collection;
  allPageListConfig: AllPageListConfig;
  userInfo: DeleteCollectionInfo;
}) => {
  const t = useAFFiNEI18N();
  return (
    <FlexWrapper alignItems="center">
      <CollectionOperations
        info={userInfo}
        collection={collection}
        config={allPageListConfig}
      >
        <Button
          className={styles.filterMenuTrigger}
          type="default"
          icon={<FilterIcon />}
          data-testid="create-first-filter"
        >
          {t['com.affine.filter']()}
        </Button>
      </CollectionOperations>
    </FlexWrapper>
  );
};

export const AllPageListOperationsMenu = ({
  propertiesMeta,
  filterList,
  onChangeFilterList,
}: {
  propertiesMeta: PropertiesMeta;
  filterList: Filter[];
  onChangeFilterList: (filterList: Filter[]) => void;
}) => {
  const t = useAFFiNEI18N();

  return (
    <FlexWrapper alignItems="center">
      <Menu
        items={
          <CreateFilterMenu
            propertiesMeta={propertiesMeta}
            value={filterList}
            onChange={onChangeFilterList}
          />
        }
      >
        <Button
          className={styles.filterMenuTrigger}
          type="default"
          icon={<FilterIcon />}
          data-testid="create-first-filter"
        >
          {t['com.affine.filter']()}
        </Button>
      </Menu>
    </FlexWrapper>
  );
};
