import {
  DatePicker,
  Menu,
  type MenuRef,
  PropertyValue,
} from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { i18nTime, useI18n } from '@affine/i18n';
import { DateTimeIcon } from '@blocksuite/icons/rc';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { DocListPropertyProps, GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import { FilterOptionsGroup } from '../filter/options';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './date.css';

const useParsedDate = (value: string) => {
  const parsedValue =
    typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}$/)
      ? value
      : undefined;
  const displayValue = parsedValue
    ? i18nTime(parsedValue, { absolute: { accuracy: 'day' } })
    : undefined;
  const t = useI18n();
  return {
    parsedValue,
    displayValue:
      displayValue ??
      t['com.affine.page-properties.property-value-placeholder'](),
  };
};

export const DateValue = ({
  value,
  onChange,
  readonly,
}: PropertyValueProps) => {
  const { parsedValue, displayValue } = useParsedDate(value);

  if (readonly) {
    return (
      <PropertyValue
        className={parsedValue ? '' : styles.empty}
        isEmpty={!parsedValue}
        readonly
      >
        {displayValue}
      </PropertyValue>
    );
  }

  return (
    <Menu
      contentOptions={{
        style: BUILD_CONFIG.isMobileEdition ? { padding: '15px 20px' } : {},
      }}
      items={<DatePicker value={parsedValue} onChange={onChange} />}
    >
      <PropertyValue
        className={parsedValue ? '' : styles.empty}
        isEmpty={!parsedValue}
      >
        {displayValue}
      </PropertyValue>
    </Menu>
  );
};

const DateSelectorMenu = ({
  ref,
  value,
  onChange,
  onClose,
}: {
  ref?: React.Ref<MenuRef>;
  value?: string;
  onChange: (value: string) => void;
  onClose?: () => void;
}) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      changeOpen: (open: boolean) => {
        setOpen(open);
        if (!open) {
          onClose?.();
        }
      },
    }),
    [onClose]
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      setOpen(open);
      if (!open) {
        onClose?.();
      }
    },
    [onClose]
  );

  const handleChange = useCallback(
    (value: string) => {
      onChange(value);
      setOpen(false);
      onClose?.();
    },
    [onChange, onClose]
  );

  return (
    <FilterValueMenu
      rootOptions={{
        open,
        onOpenChange: handleOpenChange,
      }}
      contentOptions={{
        style: { padding: '12px 16px' },
      }}
      items={<DatePicker value={value || undefined} onChange={handleChange} />}
    >
      {value ? (
        <span>{value}</span>
      ) : (
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      )}
    </FilterValueMenu>
  );
};

const DateFilterValueAfterBefore = ({
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
  const menuRef = useRef<MenuRef>(null);
  const value = filter.value;
  const values = value?.split(',') ?? [];

  const handleChange = useCallback(
    (date: string) => {
      onChange?.({
        ...filter,
        value: date,
      });
    },
    [onChange, filter]
  );

  useEffect(() => {
    if (isDraft) {
      menuRef.current?.changeOpen(true);
    }
  }, [isDraft]);

  return (
    <DateSelectorMenu
      ref={menuRef}
      value={values[0]}
      onChange={handleChange}
      onClose={onDraftCompleted}
    />
  );
};

export const DateFilterValue = ({
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
  const value = filter.value;
  const values = value?.split(',') ?? [];

  const handleChange = useCallback(
    (date: string) => {
      onChange?.({
        ...filter,
        value: date,
      });
    },
    [onChange, filter]
  );

  useEffect(() => {
    if (
      isDraft &&
      filter.method !== 'after' &&
      filter.method !== 'before' &&
      filter.method !== 'between'
    ) {
      onDraftCompleted?.();
    }
  }, [isDraft, filter.method, onDraftCompleted]);

  return filter.method === 'after' || filter.method === 'before' ? (
    <DateFilterValueAfterBefore
      filter={filter}
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      onChange={onChange}
    />
  ) : filter.method === 'between' ? (
    <FilterOptionsGroup
      isDraft={isDraft}
      onDraftCompleted={onDraftCompleted}
      items={[
        ({ onDraftCompleted, menuRef }) => (
          <DateSelectorMenu
            ref={menuRef}
            value={values[0]}
            onChange={value => handleChange(`${value},${values[1] || ''}`)}
            onClose={onDraftCompleted}
          />
        ),
        <span key="between" style={{ color: cssVarV2('text/placeholder') }}>
          &nbsp;-&nbsp;
        </span>,
        ({ onDraftCompleted, menuRef }) => (
          <DateSelectorMenu
            ref={menuRef}
            value={values[1]}
            onChange={value => handleChange(`${values[0] || ''},${value}`)}
            onClose={onDraftCompleted}
          />
        ),
      ]}
    ></FilterOptionsGroup>
  ) : undefined;
};

export const DateDocListProperty = ({ value }: DocListPropertyProps) => {
  if (!value) return null;

  return (
    <StackProperty icon={<DateTimeIcon />}>
      {i18nTime(value, { absolute: { accuracy: 'day' } })}
    </StackProperty>
  );
};

export const DateGroupHeader = ({ groupId, docCount }: GroupHeaderProps) => {
  const date = groupId || 'No Date';

  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {date}
    </PlainTextDocGroupHeader>
  );
};
