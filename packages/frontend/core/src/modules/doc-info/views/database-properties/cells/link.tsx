import { PropertyValue } from '@affine/component';
import { useI18n } from '@affine/i18n';
import type { LiveData } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import {
  type ChangeEventHandler,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { DatabaseCellRendererProps } from '../../../types';
import * as styles from './link.css';

export const LinkCell = ({
  cell,
  dataSource,
  rowId,
}: DatabaseCellRendererProps) => {
  const isEmpty = useLiveData(
    cell.value$.map(value => typeof value !== 'string' || !value)
  );
  const link = useLiveData(cell.value$ as LiveData<string | undefined>) || '';

  const [editing, setEditing] = useState(false);
  const [tempValue, setTempValue] = useState<string>(link);

  const ref = useRef<HTMLTextAreaElement>(null);
  const commitChange = useCallback(() => {
    dataSource.cellValueChange(rowId, cell.id, tempValue.trim());
    setEditing(false);
    setTempValue(tempValue.trim());
  }, [dataSource, rowId, cell.id, tempValue]);

  const handleOnChange: ChangeEventHandler<HTMLTextAreaElement> = useCallback(
    e => {
      setTempValue(e.target.value);
    },
    []
  );

  const onKeydown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter') {
        commitChange();
      } else if (e.key === 'Escape') {
        setEditing(false);
        setTempValue(link);
      }
    },
    [commitChange, link]
  );

  useEffect(() => {
    setTempValue(link);
  }, [link]);

  const onClick = useCallback(() => {
    setEditing(true);
    setTimeout(() => {
      ref.current?.focus();
    });
  }, []);

  const onLinkClick = useCallback((e: React.MouseEvent) => {
    // prevent click event from propagating to parent (editing)
    e.stopPropagation();
    setEditing(false);
  }, []);

  const t = useI18n();

  return (
    <PropertyValue
      className={styles.textPropertyValueContainer}
      isEmpty={isEmpty}
      onClick={onClick}
    >
      {!editing ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onLinkClick}
          className={styles.link}
        >
          {link?.replace(/^https?:\/\//, '').trim()}
        </a>
      ) : (
        <>
          <textarea
            ref={ref}
            onKeyDown={onKeydown}
            className={styles.textarea}
            onBlur={commitChange}
            value={tempValue || ''}
            onChange={handleOnChange}
            data-empty={!tempValue}
            placeholder={t[
              'com.affine.page-properties.property-value-placeholder'
            ]()}
          />
          <div className={styles.textInvisible}>
            {tempValue}
            {tempValue?.endsWith('\n') || !tempValue ? <br /> : null}
          </div>
        </>
      )}
    </PropertyValue>
  );
};
