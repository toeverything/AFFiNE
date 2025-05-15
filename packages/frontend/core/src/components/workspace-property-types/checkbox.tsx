import { Checkbox, Menu, MenuItem, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';
import { CheckBoxCheckLinearIcon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { DocListPropertyProps, GroupHeaderProps } from '../explorer/types';
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

export const CheckboxDocListProperty = ({
  value,
  propertyInfo,
}: DocListPropertyProps) => {
  const t = useI18n();
  if (!value) return null;

  return (
    <StackProperty icon={<CheckBoxCheckLinearIcon />}>
      {/* 
        Has circular dependency issue (WorkspacePropertyName -> WorkspacePropertyTypes -> Checkbox)
        <WorkspacePropertyName propertyInfo={propertyInfo} /> 
      */}
      {propertyInfo.name || t['unnamed']()}
    </StackProperty>
  );
};

export const CheckboxGroupHeader = ({
  groupId,
  docCount,
  collapsed,
  onCollapse,
}: GroupHeaderProps) => {
  const text = groupId === 'true' ? 'Checked' : 'Unchecked';
  return (
    <PlainTextDocGroupHeader
      docCount={docCount}
      groupId={groupId}
      collapsed={collapsed}
      onCollapse={onCollapse}
    >
      {text}
    </PlainTextDocGroupHeader>
  );
};
