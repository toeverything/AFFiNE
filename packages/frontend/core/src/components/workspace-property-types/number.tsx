import { Input, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';
import { NumberIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  type ChangeEventHandler,
  useCallback,
  useEffect,
  useState,
} from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './number.css';

export const NumberValue = ({
  value,
  onChange,
  readonly,
}: PropertyValueProps) => {
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
      readonly={readonly}
    >
      <input
        className={styles.numberPropertyValueInput}
        type="number"
        inputMode="decimal"
        value={tempValue || ''}
        onChange={handleOnChange}
        onBlur={handleBlur}
        data-empty={!tempValue}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
        disabled={readonly}
      />
    </PropertyValue>
  );
};

export const NumberFilterValue = ({
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
  const [tempValue, setTempValue] = useState(filter.value || '');
  const [valueMenuOpen, setValueMenuOpen] = useState(false);
  const t = useI18n();

  useEffect(() => {
    // update temp value with new filter value
    setTempValue(filter.value || '');
  }, [filter.value]);

  const submitTempValue = useCallback(() => {
    if (tempValue !== (filter.value || '')) {
      onChange?.({
        ...filter,
        value: tempValue,
      });
    }
  }, [filter, onChange, tempValue]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Escape') return;
      submitTempValue();
      setValueMenuOpen(false);
      onDraftCompleted?.();
    },
    [submitTempValue, onDraftCompleted]
  );

  const handleInputEnter = useCallback(() => {
    submitTempValue();
    setValueMenuOpen(false);
    onDraftCompleted?.();
  }, [submitTempValue, onDraftCompleted]);

  useEffect(() => {
    if (
      isDraft &&
      (filter.method === 'is-not-empty' || filter.method === 'is-empty')
    ) {
      onDraftCompleted?.();
    }
  }, [isDraft, filter.method, onDraftCompleted]);

  return filter.method !== 'is-not-empty' && filter.method !== 'is-empty' ? (
    <FilterValueMenu
      rootOptions={{
        open: valueMenuOpen,
        onOpenChange: setValueMenuOpen,
        onClose: onDraftCompleted,
      }}
      contentOptions={{
        onPointerDownOutside: submitTempValue,
      }}
      items={
        <Input
          inputStyle={{
            fontSize: cssVar('fontBase'),
          }}
          type="number"
          inputMode="decimal"
          autoFocus
          autoSelect
          value={tempValue}
          onChange={value => {
            setTempValue(value);
          }}
          onEnter={handleInputEnter}
          onKeyDown={handleInputKeyDown}
          style={{ height: 34, borderRadius: 4 }}
        />
      }
    >
      {filter.value ? (
        <span>{filter.value}</span>
      ) : (
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      )}
    </FilterValueMenu>
  ) : null;
};

export const NumberDocListProperty = ({ value }: { value: number }) => {
  if (value !== 0 && !value) {
    return null;
  }

  return <StackProperty icon={<NumberIcon />}>{value}</StackProperty>;
};

export const NumberGroupHeader = ({ groupId, docCount }: GroupHeaderProps) => {
  const t = useI18n();
  const number = groupId || t['com.affine.filter.empty']();
  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {number}
    </PlainTextDocGroupHeader>
  );
};
