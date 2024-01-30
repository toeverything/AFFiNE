import { CollectionService } from '@affine/core/modules/collection';
import type { Collection, Filter } from '@affine/env/filter';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useCallback } from 'react';

import { filterContainerStyle } from '../../../components/filter-container.css';
import {
  FilterList,
  SaveAsCollectionButton,
  useCollectionManager,
} from '../../../components/page-list';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';

export const FilterContainer = () => {
  const currentWorkspace = useService(Workspace);
  const navigateHelper = useNavigateHelper();
  const setting = useCollectionManager(useService(CollectionService));
  const saveToCollection = useCallback(
    (collection: Collection) => {
      setting.createCollection({
        ...collection,
        filterList: setting.currentCollection.filterList,
      });
      navigateHelper.jumpToCollection(currentWorkspace.id, collection.id);
    },
    [setting, navigateHelper, currentWorkspace.id]
  );

  const onFilterChange = useCallback(
    (filterList: Filter[]) => {
      setting.updateCollection({
        ...setting.currentCollection,
        filterList,
      });
    },
    [setting]
  );

  if (!setting.isDefault || !setting.currentCollection.filterList.length) {
    return null;
  }

  return (
    <div className={filterContainerStyle}>
      <div style={{ flex: 1 }}>
        <FilterList
          propertiesMeta={currentWorkspace.blockSuiteWorkspace.meta.properties}
          value={setting.currentCollection.filterList}
          onChange={onFilterChange}
        />
      </div>
      <div>
        {setting.currentCollection.filterList.length > 0 ? (
          <SaveAsCollectionButton onConfirm={saveToCollection} />
        ) : null}
      </div>
    </div>
  );
};
