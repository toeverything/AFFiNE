import { Button, FlexWrapper, Menu } from '@affine/component';
import type { Filter, PropertiesMeta } from '@affine/env/filter';
import { useI18n } from '@affine/i18n';
import { FilterIcon } from '@blocksuite/icons/rc';

import { CreateFilterMenu } from '../filter/vars';
import * as styles from './collection-list.css';

export const AllPageListOperationsMenu = ({
  propertiesMeta,
  filterList,
  onChangeFilterList,
}: {
  propertiesMeta: PropertiesMeta;
  filterList: Filter[];
  onChangeFilterList: (filterList: Filter[]) => void;
}) => {
  const t = useI18n();

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
          prefix={<FilterIcon />}
          data-testid="create-first-filter"
        >
          {t['com.affine.filter']()}
        </Button>
      </Menu>
    </FlexWrapper>
  );
};
