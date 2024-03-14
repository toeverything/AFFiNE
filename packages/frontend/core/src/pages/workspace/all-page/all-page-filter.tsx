import { CollectionService } from '@affine/core/modules/collection';
import type { Collection, Filter } from '@affine/env/filter';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useCallback } from 'react';

import { filterContainerStyle } from '../../../components/filter-container.css';
import {
  FilterList,
  SaveAsCollectionButton,
} from '../../../components/page-list';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';

export const FilterContainer = ({
  filters,
  onChangeFilters,
}: {
  filters: Filter[];
  onChangeFilters: (filters: Filter[]) => void;
}) => {
  const currentWorkspace = useService(Workspace);
  const navigateHelper = useNavigateHelper();
  const collectionService = useService(CollectionService);
  const saveToCollection = useCallback(
    (collection: Collection) => {
      collectionService.addCollection({
        ...collection,
        filterList: filters,
      });
      navigateHelper.jumpToCollection(currentWorkspace.id, collection.id);
    },
    [collectionService, filters, navigateHelper, currentWorkspace.id]
  );

  if (!filters.length) {
    return null;
  }

  return (
    <div className={filterContainerStyle}>
      <div style={{ flex: 1 }}>
        <FilterList
          propertiesMeta={currentWorkspace.docCollection.meta.properties}
          value={filters}
          onChange={onChangeFilters}
        />
      </div>
      <div>
        {filters.length > 0 ? (
          <SaveAsCollectionButton onConfirm={saveToCollection} />
        ) : null}
      </div>
    </div>
  );
};
