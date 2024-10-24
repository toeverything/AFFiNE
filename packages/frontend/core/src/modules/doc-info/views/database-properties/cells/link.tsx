import { PropertyValue } from '@affine/component';
import { AffinePageReference } from '@affine/core/components/affine/reference-link';
import { resolveLinkToDoc } from '@affine/core/modules/navigation';
import { useI18n } from '@affine/i18n';
import type { LiveData } from '@toeverything/infra';
import { useLiveData } from '@toeverything/infra';
import {
  type ChangeEventHandler,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
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

  const resolvedDocLink = useMemo(() => {
    const docInfo = resolveLinkToDoc(link);

    if (docInfo) {
      const params = new URLSearchParams();
      if (docInfo.mode) {
        params.set('mode', docInfo.mode);
      }
      if (docInfo.blockIds) {
        params.set('blockIds', docInfo.blockIds.join(','));
      }
      if (docInfo.elementIds) {
        params.set('elementIds', docInfo.elementIds.join(','));
      }
      return {
        docId: docInfo.docId,
        params,
      };
    }
    return null;
  }, [link]);

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
      className={styles.container}
      isEmpty={isEmpty}
      onClick={onClick}
    >
      {!editing ? (
        resolvedDocLink ? (
          <AffinePageReference
            pageId={resolvedDocLink.docId}
            params={resolvedDocLink.params}
          />
        ) : (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onLinkClick}
            className={styles.link}
          >
            {link?.replace(/^https?:\/\//, '').trim()}
          </a>
        )
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
