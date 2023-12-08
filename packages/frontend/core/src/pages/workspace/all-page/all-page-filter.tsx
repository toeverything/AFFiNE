import {
  FilterList,
  SaveAsCollectionButton,
  useCollectionManager,
} from '@affine/component/page-list';
import type { Collection, Filter } from '@affine/env/filter';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import { useCallback } from 'react';

import { collectionsCRUDAtom } from '../../../atoms/collections';
import { filterContainerStyle } from '../../../components/filter-container.css';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { useWorkspace } from '../../../hooks/use-workspace';

export const FilterContainer = ({ workspaceId }: { workspaceId: string }) => {
  const currentWorkspace = useWorkspace(workspaceId);
  const navigateHelper = useNavigateHelper();
  const setting = useCollectionManager(collectionsCRUDAtom);
  const saveToCollection = useCallback(
    async (collection: Collection) => {
      await setting.createCollection({
        ...collection,
        filterList: setting.currentCollection.filterList,
      });
      navigateHelper.jumpToCollection(workspaceId, collection.id);
    },
    [setting, navigateHelper, workspaceId]
  );

  const onFilterChange = useAsyncCallback(
    async (filterList: Filter[]) => {
      await setting.updateCollection({
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
