import { Button, RowInput } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { type PropsWithChildren, type ReactNode, useCallback } from 'react';

import * as styles from './selector-layout.css';

export interface SelectorContentProps extends PropsWithChildren {
  searchPlaceholder?: string;
  selectedCount?: number;

  onSearch?: (value: string) => void;
  onClear?: () => void;
  onCancel?: () => void;
  onConfirm?: () => void;

  actions?: ReactNode;
}

/**
 * Provides a unified layout for doc/collection/tag selector
 * - Header (Search input)
 * - Content
 * - Footer (Selected count + Actions)
 */
export const SelectorLayout = ({
  children,
  searchPlaceholder,
  selectedCount,

  onSearch,
  onClear,
  onCancel,
  onConfirm,

  actions,
}: SelectorContentProps) => {
  const t = useI18n();

  const onSearchChange = useCallback(
    (value: string) => {
      onSearch?.(value);
    },
    [onSearch]
  );

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <RowInput
          className={styles.search}
          placeholder={searchPlaceholder}
          onChange={onSearchChange}
        />
      </header>

      <main className={styles.content}>{children}</main>

      <footer className={styles.footer}>
        <div className={styles.footerInfo}>
          <div className={styles.selectedCount}>
            <span>{t['com.affine.selectPage.selected']()}</span>
            <span className={styles.selectedNum}>{selectedCount ?? 0}</span>
          </div>
          <Button
            variant="plain"
            className={styles.clearButton}
            onClick={onClear}
          >
            {t['com.affine.editCollection.pages.clear']()}
          </Button>
        </div>

        <div className={styles.footerAction}>
          {actions ?? (
            <>
              <Button onClick={onCancel} className={styles.actionButton}>
                {t['Cancel']()}
              </Button>
              <Button
                onClick={onConfirm}
                className={styles.actionButton}
                variant="primary"
              >
                {t['Confirm']()}
              </Button>
            </>
          )}
        </div>
      </footer>
    </div>
  );
};
