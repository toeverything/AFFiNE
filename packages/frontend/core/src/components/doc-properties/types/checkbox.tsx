import { Checkbox, PropertyValue } from '@affine/component';
import { useCallback } from 'react';

import * as styles from './checkbox.css';
import type { PropertyValueProps } from './types';

export const CheckboxValue = ({ value, onChange }: PropertyValueProps) => {
  const parsedValue = value === 'true' ? true : false;
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange(parsedValue ? 'false' : 'true');
    },
    [onChange, parsedValue]
  );
  return (
    <PropertyValue onClick={handleClick}>
      <Checkbox
        className={styles.checkboxProperty}
        checked={parsedValue}
        onChange={() => {}}
      />
    </PropertyValue>
  );
};
