import { Checkbox, DatePicker, Menu } from '@affine/component';
import { useAllBlockSuiteDocMeta } from '@affine/core/hooks/use-all-block-suite-page-meta';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/workspace/properties/schema';
import { timestampToLocalDate } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { Doc, useService, Workspace } from '@toeverything/infra';
import { noop } from 'lodash-es';
import {
  type ChangeEventHandler,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { managerContext } from './common';
import * as styles from './styles.css';
import { TagsInlineEditor } from './tags-inline-editor';

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

export const TextValue = ({ property }: PropertyRowValueProps) => {
  const manager = useContext(managerContext);
  const [value, setValue] = useState<string>(property.value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const handleBlur = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      manager.updateCustomProperty(property.id, {
        value: e.target.value.trim(),
      });
    },
    [manager, property.id]
  );
  const handleOnChange: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    e => {
      setValue(e.target.value);
    },
    []
  );
  const t = useAFFiNEI18N();
  useEffect(() => {
    setValue(property.value);
  }, [property.value]);

  return (
    <div onClick={handleClick} className={styles.propertyRowValueTextCell}>
      <textarea
        className={styles.propertyRowValueTextarea}
        value={value || ''}
        onChange={handleOnChange}
        onClick={handleClick}
        onBlur={handleBlur}
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
  const t = useAFFiNEI18N();
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
  const workspace = useService(Workspace);
  const page = useService(Doc);
  const docCollection = workspace.docCollection;
  const pageMetas = useAllBlockSuiteDocMeta(docCollection);

  const pageMeta = pageMetas.find(x => x.id === page.id);
  assertExists(pageMeta, 'pageMeta should exist');
  const t = useAFFiNEI18N();

  return (
    <TagsInlineEditor
      className={styles.propertyRowValueCell}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
      pageId={page.id}
      readonly={page.blockSuiteDoc.readonly}
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
  // todo: fix following
  tags: TagsValue,
  progress: TextValue,
};
