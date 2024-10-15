import { PropertyValue } from '@affine/component';
import { useI18n } from '@affine/i18n';
import {
  type ChangeEventHandler,
  useCallback,
  useEffect,
  useState,
} from 'react';

import * as styles from './number.css';
import type { PropertyValueProps } from './types';

export const NumberValue = ({ value, onChange }: PropertyValueProps) => {
  const parsedValue = isNaN(Number(value)) ? null : value;
  const [tempValue, setTempValue] = useState(parsedValue);
  const handleBlur = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value.trim());
    },
    [onChange]
  );
  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      setTempValue(e.target.value.trim());
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setTempValue(parsedValue);
  }, [parsedValue]);
  return (
    <PropertyValue
      className={styles.numberPropertyValueContainer}
      isEmpty={!parsedValue}
    >
      <input
        className={styles.numberPropertyValueInput}
        type={'number'}
        value={tempValue || ''}
        onChange={handleOnChange}
        onBlur={handleBlur}
        data-empty={!tempValue}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
      />
    </PropertyValue>
  );
};
