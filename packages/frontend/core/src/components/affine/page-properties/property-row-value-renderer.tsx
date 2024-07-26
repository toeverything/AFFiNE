import { Checkbox, DatePicker, Menu } from '@affine/component';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/properties/services/schema';
import { i18nTime, useI18n } from '@affine/i18n';
import { DocService, useService } from '@toeverything/infra';
import { noop } from 'lodash-es';
import type { ChangeEventHandler } from 'react';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { managerContext } from './common';
import * as styles from './styles.css';
import { TagsInlineEditor } from './tags-inline-editor';

interface PropertyRowValueProps {
  property: PageInfoCustomProperty;
  meta: PageInfoCustomPropertyMeta;
}

export const DateValue = ({ property }: PropertyRowValueProps) => {
  const displayValue = property.value
    ? i18nTime(property.value, { absolute: { accuracy: 'day' } })
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

  const t = useI18n();

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

export const TextValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const [value, setValue] = useState<string>(property.value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      manager.updateCustomProperty(property.id, {
        value: (e.currentTarget as HTMLTextAreaElement).value.trim(),
      });
    },
    [manager, property.id]
  );
  // use native blur event to get event after unmount
  // don't use useLayoutEffect here, cause the cleanup function will be called before unmount
  useEffect(() => {
    ref.current?.addEventListener('blur', handleBlur);
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ref.current?.removeEventListener('blur', handleBlur);
    };
  }, [handleBlur]);
  const handleOnChange: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    e => {
      setValue(e.target.value);
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setValue(property.value);
  }, [property.value]);

  return (
    <div onClick={handleClick} className={styles.propertyRowValueTextCell}>
      <textarea
        ref={ref}
        className={styles.propertyRowValueTextarea}
        value={value || ''}
        onChange={handleOnChange}
        onClick={handleClick}
        data-empty={!value}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
      />
      <div className={styles.propertyRowValueTextareaInvisible}>
        {value}
        {value?.endsWith('\n') || !value ? <br /> : null}
      </div>
    </div>
  );
};

export const NumberValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const [value, setValue] = useState(property.value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const handleBlur = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      manager.updateCustomProperty(property.id, {
        value: e.target.value.trim(),
      });
    },
    [manager, property.id]
  );
  const handleOnChange: ChangeEventHandler<HTMLInputElement> = useCallback(
    e => {
      setValue(e.target.value);
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setValue(property.value);
  }, [property.value]);
  return (
    <input
      className={styles.propertyRowValueNumberCell}
      type={'number'}
      value={value || ''}
      onChange={handleOnChange}
      onClick={handleClick}
      onBlur={handleBlur}
      data-empty={!value}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
    />
  );
};

export const TagsValue = () => {
  const doc = useService(DocService).doc;

  const t = useI18n();

  return (
    <TagsInlineEditor
      className={styles.propertyRowValueCell}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
      pageId={doc.id}
      readonly={doc.blockSuiteDoc.readonly}
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
  number: NumberValue,
  // TODO(@Peng): fix following
  tags: TagsValue,
  progress: TextValue,
};
