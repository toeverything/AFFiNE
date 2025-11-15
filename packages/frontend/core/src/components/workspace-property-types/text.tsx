import { Input, PropertyValue } from '@affine/component';
import type { FilterParams } from '@affine/core/modules/collection-rules';
import { useI18n } from '@affine/i18n';
import { TextIcon, TextTypeIcon } from '@blocksuite/icons/rc';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import {
  type ChangeEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { PlainTextDocGroupHeader } from '../explorer/docs-view/group-header';
import { StackProperty } from '../explorer/docs-view/stack-property';
import type { GroupHeaderProps } from '../explorer/types';
import { FilterValueMenu } from '../filter/filter-value-menu';
import { ConfigModal } from '../mobile';
import type { PropertyValueProps } from '../properties/types';
import * as styles from './text.css';

const DesktopTextValue = ({
  value,
  onChange,
  readonly,
}: PropertyValueProps) => {
  const [tempValue, setTempValue] = useState<string>(value);
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      onChange((e.currentTarget as HTMLTextAreaElement).value.trim());
    },
    [onChange]
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
      setTempValue(e.target.value);
    },
    []
  );
  const t = useI18n();
  useEffect(() => {
    setTempValue(value);
  }, [value]);

  return (
    <PropertyValue
      className={styles.textPropertyValueContainer}
      onClick={handleClick}
      isEmpty={!value}
      readonly={readonly}
    >
      <textarea
        ref={ref}
        className={styles.textarea}
        value={tempValue || ''}
        onChange={handleOnChange}
        onClick={handleClick}
        data-empty={!tempValue}
        autoFocus={false}
        placeholder={t[
          'com.affine.page-properties.property-value-placeholder'
        ]()}
        disabled={readonly}
      />
      <div className={styles.textInvisible}>
        {tempValue}
        {tempValue?.endsWith('\n') || !tempValue ? <br /> : null}
      </div>
    </PropertyValue>
  );
};

const MobileTextValue = ({
  value,
  onChange,
  propertyInfo,
}: PropertyValueProps) => {
  const [open, setOpen] = useState(false);

  const [tempValue, setTempValue] = useState<string>(value || '');
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(true);
  }, []);
  const ref = useRef<HTMLTextAreaElement>(null);
  const handleBlur = useCallback(
    (e: FocusEvent) => {
      onChange((e.currentTarget as HTMLTextAreaElement).value.trim());
    },
    [onChange]
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
      setTempValue(e.target.value);
    },
    []
  );
  const onClose = useCallback(() => {
    setOpen(false);
    onChange(tempValue.trim());
  }, [onChange, tempValue]);
  const t = useI18n();
  useEffect(() => {
    setTempValue(value || '');
  }, [value]);

  return (
    <>
      <PropertyValue
        className={styles.textPropertyValueContainer}
        onClick={handleClick}
        isEmpty={!value}
      >
        <div className={styles.mobileTextareaPlain} data-empty={!tempValue}>
          {tempValue ||
            t['com.affine.page-properties.property-value-placeholder']()}
        </div>
      </PropertyValue>
      <ConfigModal
        open={open}
        onOpenChange={setOpen}
        onBack={onClose}
        title={
          <>
            <TextIcon />
            {propertyInfo?.name}
          </>
        }
      >
        <div className={styles.mobileTextareaWrapper}>
          <textarea
            ref={ref}
            className={styles.mobileTextarea}
            value={tempValue || ''}
            onChange={handleOnChange}
            data-empty={!tempValue}
            autoFocus
            placeholder={t[
              'com.affine.page-properties.property-value-placeholder'
            ]()}
          />
          <div className={styles.mobileTextInvisible}>
            {tempValue}
            {tempValue?.endsWith('\n') || !tempValue ? <br /> : null}
          </div>
        </div>
      </ConfigModal>
    </>
  );
};

export const TextValue = BUILD_CONFIG.isMobileWeb
  ? MobileTextValue
  : DesktopTextValue;

export const TextFilterValue = ({
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
      isDraft={isDraft}
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

export const TextDocListProperty = ({ value }: { value: string }) => {
  if (!value) {
    return null;
  }

  return <StackProperty icon={<TextTypeIcon />}>{value}</StackProperty>;
};

export const TextGroupHeader = ({ groupId, docCount }: GroupHeaderProps) => {
  const text = groupId || 'No Text';
  return (
    <PlainTextDocGroupHeader groupId={groupId} docCount={docCount}>
      {text}
    </PlainTextDocGroupHeader>
  );
};
