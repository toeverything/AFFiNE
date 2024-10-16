import { DatePicker, Menu, PropertyValue } from '@affine/component';
import { i18nTime, useI18n } from '@affine/i18n';

import * as styles from './date.css';
import type { PropertyValueProps } from './types';

export const DateValue = ({ value, onChange }: PropertyValueProps) => {
  const parsedValue =
    typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)
      ? value
      : undefined;
  const displayValue = parsedValue
    ? i18nTime(parsedValue, { absolute: { accuracy: 'day' } })
    : undefined;

  const t = useI18n();

  return (
    <Menu items={<DatePicker value={parsedValue} onChange={onChange} />}>
      <PropertyValue
        className={parsedValue ? '' : styles.empty}
        isEmpty={!parsedValue}
      >
        {displayValue ??
          t['com.affine.page-properties.property-value-placeholder']()}
      </PropertyValue>
    </Menu>
  );
};
