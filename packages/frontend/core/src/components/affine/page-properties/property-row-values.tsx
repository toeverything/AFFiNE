import { Checkbox, DatePicker, Menu } from '@affine/component';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/workspace/properties/schema';
import { timestampToLocalDate } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { noop } from 'lodash-es';
import { type ChangeEventHandler, useCallback, useContext } from 'react';

import { managerContext } from './common';
import * as styles from './styles.css';

interface PropertyRowValueProps {
  property: PageInfoCustomProperty;
  meta: PageInfoCustomPropertyMeta;
}

export const DateValue = ({ property }: PropertyRowValueProps) => {
  const displayValue = property.value
    ? timestampToLocalDate(property.value)
    : undefined;
  const manager = useContext(managerContext);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // show edit popup
  }, []);

  const handleChange = useCallback(
    (e: string) => {
      manager.updateCustomProperty(property.id, {
        value: e,
      });
    },
    [manager, property.id]
  );

  const t = useAFFiNEI18N();

  return (
    <Menu items={<DatePicker value={property.value} onChange={handleChange} />}>
      <div
        onClick={handleClick}
        className={styles.propertyRowValueCell}
        data-empty={!property.value}
      >
        {displayValue ??
          t['com.affine.page-properties.property-value-placeholder']()}
      </div>
    </Menu>
  );
};

export const CheckboxValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      manager.updateCustomProperty(property.id, {
        value: !property.value,
      });
    },
    [manager, property.id, property.value]
  );
  return (
    <div
      onClick={handleClick}
      className={styles.propertyRowValueCell}
      data-empty={!property.value}
    >
      <Checkbox
        className={styles.checkboxProperty}
        checked={!!property.value}
        onChange={noop}
      />
    </div>
  );
};

export const TextValue = ({ property, meta }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    // todo: show edit popup
  }, []);
  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      manager.updateCustomProperty(property.id, {
        value: e.target.value,
      });
    },
    [manager, property.id]
  );
  const t = useAFFiNEI18N();
  const isNumber = meta.type === 'number';
  return (
    <input
      type={isNumber ? 'number' : 'text'}
      value={property.value || ''}
      onChange={handleOnChange}
      onClick={handleClick}
      className={styles.propertyRowValueTextCell}
      data-empty={!property.value}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
    />
  );
};

export const propertyValueRenderers: Record<
  PagePropertyType,
  typeof DateValue
> = {
  date: DateValue,
  checkbox: CheckboxValue,
  text: TextValue,
  number: TextValue,
  // todo: fix following
  tags: TextValue,
  progress: TextValue,
};
