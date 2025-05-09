import { Checkbox, Menu, MenuItem, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useCallback } from 'react';

import type { PropertyValueProps } from '../properties/types';
import * as styles from './checkbox.css';

export const CheckboxValue = ({
  value,
  onChange,
  readonly,
}: PropertyValueProps) => {
  const parsedValue = value === 'true' ? true : false;
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (readonly) {
        return;
      }
      onChange(parsedValue ? 'false' : 'true');
    },
    [onChange, parsedValue, readonly]
  );
  return (
    <PropertyValue onClick={handleClick} className={styles.container}>
      <Checkbox
        className={styles.checkboxProperty}
        checked={parsedValue}
        onChange={() => {}}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const CheckboxFilterValue = ({
  filter,
  onChange,
}: {
  filter: FilterParams;
  onChange: (filter: FilterParams) => void;
}) => {
  return (
    <Menu
      items={
        <>
          <MenuItem
            onClick={() => {
              onChange({
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
              onChange({
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
    </Menu>
  );
};
