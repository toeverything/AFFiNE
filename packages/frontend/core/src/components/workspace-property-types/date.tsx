import { DatePicker, Menu, PropertyValue, Tooltip } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { DocService } from '@affine/core/modules/doc';
import { i18nTime, useI18n } from '@affine/i18n';
import { useLiveData, useServices } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback } from 'react';

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

const toRelativeDate = (time: string | number) => {
  return i18nTime(time, {
    relative: {
      max: [1, 'day'],
    },
    absolute: {
      accuracy: 'day',
    },
  });
};

const MetaDateValueFactory = ({
  type,
}: {
  type: 'createDate' | 'updatedDate';
}) =>
  function ReadonlyDateValue() {
    const { docService } = useServices({
      DocService,
    });

    const docMeta = useLiveData(docService.doc.meta$);
    const value = docMeta?.[type];

    const relativeDate = value ? toRelativeDate(value) : null;
    const date = value ? i18nTime(value) : null;

    return (
      <Tooltip content={date} side="top" align="end">
        <PropertyValue
          className={relativeDate ? '' : styles.empty}
          isEmpty={!relativeDate}
        >
          {relativeDate}
        </PropertyValue>
      </Tooltip>
    );
  };

export const CreateDateValue = MetaDateValueFactory({
  type: 'createDate',
});

export const UpdatedDateValue = MetaDateValueFactory({
  type: 'updatedDate',
});

export const DateFilterValue = ({
  filter,
  onChange,
}: {
  filter: FilterParams;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const value = filter.value;
  const values = value?.split(',') ?? [];
  const displayDates =
    values.map(t => i18nTime(t, { absolute: { accuracy: 'day' } })) ?? [];

  const handleChange = useCallback(
    (date: string) => {
      onChange({
        ...filter,
        value: date,
      });
    },
    [onChange, filter]
  );

  return filter.method === 'after' || filter.method === 'before' ? (
    <Menu
      items={
        <DatePicker value={values[0] || undefined} onChange={handleChange} />
      }
    >
      {displayDates[0] ? (
        <span>{displayDates[0]}</span>
      ) : (
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      )}
    </Menu>
  ) : filter.method === 'between' ? (
    <>
      <Menu
        items={
          <DatePicker
            value={values[0] || undefined}
            onChange={value => handleChange(`${value},${values[1] || ''}`)}
          />
        }
      >
        {displayDates[0] ? (
          <span>{displayDates[0]}</span>
        ) : (
          <span style={{ color: cssVarV2('text/placeholder') }}>
            {t['com.affine.filter.empty']()}
          </span>
        )}
      </Menu>
      <span style={{ color: cssVarV2('text/placeholder') }}>&nbsp;-&nbsp;</span>
      <Menu
        items={
          <DatePicker
            value={values[1] || undefined}
            onChange={value => handleChange(`${values[0] || ''},${value}`)}
          />
        }
      >
        {displayDates[1] ? (
          <span>{displayDates[1]}</span>
        ) : (
          <span style={{ color: cssVarV2('text/placeholder') }}>
            {t['com.affine.filter.empty']()}
          </span>
        )}
      </Menu>
    </>
  ) : undefined;
};
