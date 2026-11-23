import { MenuItem } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';

import { FilterValueMenu } from '../filter/filter-value-menu';

export const FavoriteFilterValue = ({
  filter,
  isDraft,
  onDraftCompleted,
  onChange,
}: {
  filter: FilterParams;
  isDraft?: boolean;
  onDraftCompleted?: () => void;
  onChange?: (filter: FilterParams) => void;
}) => {
  return (
    <FilterValueMenu
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={
        <>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'true',
              });
            }}
            selected={filter.value === 'true'}
          >
            {'True'}
          </MenuItem>
          <MenuItem
            onClick={() => {
              onChange?.({
                ...filter,
                value: 'false',
              });
            }}
            selected={filter.value !== 'true'}
          >
            {'False'}
          </MenuItem>
        </>
      }
    >
      <span>{filter.value === 'true' ? 'True' : 'False'}</span>
    </FilterValueMenu>
  );
};
