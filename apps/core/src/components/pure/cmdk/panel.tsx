import { useAFFiNEI18N } from '@affine/i18n/hooks';
import clsx from 'clsx';
import { Command } from 'cmdk';
import { forwardRef, useCallback } from 'react';

import * as styles from './panel.css';

const SearchInput = forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(function SearchInput({ className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={clsx(className, styles.searchInput)}
    />
  );
});

export const CMDKContainer = forwardRef<
  HTMLDivElement,
  React.HtmlHTMLAttributes<HTMLDivElement> & {
    query: string;
    onQueryChange: (query: string) => void;
  }
>(function Panel({ className, onQueryChange, query, children, ...rest }, ref) {
  const t = useAFFiNEI18N();
  const handleQueryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onQueryChange?.(e.target.value);
    },
    [onQueryChange]
  );
  return (
    <div ref={ref} {...rest} className={clsx(className, styles.panelContainer)}>
      <Command
        // Handle KeyboardEvent conflicts with blocksuite
        onKeyDown={(e: React.KeyboardEvent) => {
          if (
            e.key === 'ArrowDown' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight'
          ) {
            e.stopPropagation();
          }
        }}
      >
        {/* todo: add page context here */}
        <SearchInput
          value={query}
          onChange={handleQueryChange}
          placeholder={t['com.affine.cmdk.placeholder']()}
        />
        {children}
      </Command>
    </div>
  );
});
