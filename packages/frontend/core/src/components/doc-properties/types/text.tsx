import { PropertyValue } from '@affine/component';
import { useI18n } from '@affine/i18n';
import {
  type ChangeEventHandler,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import * as styles from './text.css';
import type { PropertyValueProps } from './types';

export const TextValue = ({ value, onChange }: PropertyValueProps) => {
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
      />
      <div className={styles.textInvisible}>
        {tempValue}
        {tempValue?.endsWith('\n') || !tempValue ? <br /> : null}
      </div>
    </PropertyValue>
  );
};
