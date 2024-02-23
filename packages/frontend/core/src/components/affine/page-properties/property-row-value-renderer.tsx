import { Checkbox, DatePicker, Menu } from '@affine/component';
import { useAllBlockSuitePageMeta } from '@affine/core/hooks/use-all-block-suite-page-meta';
import { WorkspaceLegacyProperties } from '@affine/core/modules/workspace';
import type {
  PageInfoCustomProperty,
  PageInfoCustomPropertyMeta,
  PagePropertyType,
} from '@affine/core/modules/workspace/properties/schema';
import { timestampToLocalDate } from '@affine/core/utils';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { Page, useLiveData, useService, Workspace } from '@toeverything/infra';
import { noop } from 'lodash-es';
import { type ChangeEventHandler, useCallback, useContext } from 'react';

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

export const TagsValue = () => {
  const workspace = useService(Workspace);
  const page = useService(Page);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMetas = useAllBlockSuitePageMeta(blockSuiteWorkspace);
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const options = useLiveData(legacyProperties.tagOptions$);

  const pageMeta = pageMetas.find(x => x.id === page.id);
  assertExists(pageMeta, 'pageMeta should exist');
  const tagIds = pageMeta.tags;
  const t = useAFFiNEI18N();
  const onChange = useCallback(
    (tags: string[]) => {
      legacyProperties.updatePageTags(page.id, tags);
    },
    [legacyProperties, page.id]
  );

  return (
    <TagsInlineEditor
      className={styles.propertyRowValueCell}
      placeholder={t['com.affine.page-properties.property-value-placeholder']()}
      value={tagIds}
      options={options}
      readonly={page.blockSuitePage.readonly}
      onChange={onChange}
      onOptionsChange={legacyProperties.updateTagOptions}
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
  tags: TagsValue,
  progress: TextValue,
};
