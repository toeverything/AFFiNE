import { Loading } from '@affine/component/ui/loading';
import { i18nTime, isI18nString, useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { Command } from 'cmdk';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';
import * as styles from './cmdk.css';
import { HighlightText } from './highlight-text';

export const CMDK = ({
  className,
  query,
  groups = [],
  inputLabel,
  placeholder,
  loading,
  loadingProgress,
  onQueryChange,
  onSubmit,
}: React.PropsWithChildren<{
  className?: string;
  query: string;
  inputLabel?: ReactNode;
  placeholder?: string;
  loading?: boolean;
  loadingProgress?: number;
  groups?: { group?: QuickSearchGroup; items: QuickSearchItem[] }[];
  onSubmit?: (item: QuickSearchItem) => void;
  onQueryChange?: (query: string) => void;
}>) => {
  const [opening, setOpening] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // fix list height animation on opening
  useLayoutEffect(() => {
    setOpening(true);
    const timeout = setTimeout(() => {
      setOpening(false);
      inputRef.current?.focus();
    }, 150);
    return () => {
      clearTimeout(timeout);
    };
  }, []);

  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      if (listRef.current) listRef.current.scrollTop = 0;
    });
  }, [query]);

  return (
    <Command
      data-testid="cmdk-quick-search"
      shouldFilter={false}
      className={clsx(className, styles.root, styles.panelContainer)}
      loop
    >
      {inputLabel ? (
        <div className={styles.pageTitleWrapper}>
          <span className={styles.pageTitle}>{inputLabel}</span>
        </div>
      ) : null}
      <div
        className={clsx(className, styles.searchInputContainer, {
          [styles.hasInputLabel]: inputLabel,
        })}
      >
        <Command.Input
          placeholder={placeholder}
          ref={inputRef}
          value={query}
          onValueChange={onQueryChange}
          className={clsx(className, styles.searchInput)}
        />
        {loading ? (
          <Loading
            size={24}
            progress={
              loadingProgress ? Math.max(loadingProgress, 0.2) : undefined
            }
            speed={loadingProgress ? 0 : undefined}
          />
        ) : null}
      </div>

      <Command.List ref={listRef} data-opening={opening ? true : undefined}>
        {groups.map(({ group, items }) => {
          return (
            <CMDKGroup
              key={group?.id ?? ''}
              onSubmit={onSubmit}
              query={query}
              group={{ group, items }}
            />
          );
        })}
      </Command.List>
    </Command>
  );
};

export const CMDKGroup = ({
  group: { group, items },
  onSubmit,
  query,
}: {
  group: { group?: QuickSearchGroup; items: QuickSearchItem[] };
  onSubmit?: (item: QuickSearchItem) => void;
  query: string;
}) => {
  const i18n = useI18n();
  return (
    <Command.Group
      key={query + ':' + (group?.id ?? '')}
      heading={group && i18n.t(group.label)}
      style={{ overflowAnchor: 'none' }}
    >
      {items.map(item => {
        const title = !isI18nString(item.label)
          ? i18n.t(item.label.title)
          : i18n.t(item.label);
        const subTitle = !isI18nString(item.label)
          ? item.label.subTitle && i18n.t(item.label.subTitle)
          : null;
        return (
          <Command.Item
            key={item.id}
            onSelect={() => onSubmit?.(item)}
            value={item.id}
            disabled={item.disabled}
            data-is-danger={
              item.id === 'editor:page-move-to-trash' ||
              item.id === 'editor:edgeless-move-to-trash'
            }
          >
            <div className={styles.itemIcon}>
              {item.icon &&
                (typeof item.icon === 'function' ? <item.icon /> : item.icon)}
            </div>
            <div
              data-testid="cmdk-label"
              className={styles.itemLabel}
              data-value={item.id}
            >
              <div className={styles.itemTitle}>
                <HighlightText text={title} start="<b>" end="</b>" />
              </div>
              {subTitle && (
                <div className={styles.itemSubtitle}>
                  <HighlightText text={subTitle} start="<b>" end="</b>" />
                </div>
              )}
            </div>
            {item.timestamp ? (
              <div className={styles.timestamp}>
                {i18nTime(new Date(item.timestamp))}
              </div>
            ) : null}
            {item.keyBinding ? (
              <CMDKKeyBinding keyBinding={item.keyBinding} />
            ) : null}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
};

const CMDKKeyBinding = ({ keyBinding }: { keyBinding: string }) => {
  const isMacOS = environment.isBrowser && environment.isMacOs;
  const fragments = useMemo(() => {
    return keyBinding.split('+').map(fragment => {
      if (fragment === '$mod') {
        return isMacOS ? '⌘' : 'Ctrl';
      }
      if (fragment === 'ArrowUp') {
        return '↑';
      }
      if (fragment === 'ArrowDown') {
        return '↓';
      }
      if (fragment === 'ArrowLeft') {
        return '←';
      }
      if (fragment === 'ArrowRight') {
        return '→';
      }
      return fragment;
    });
  }, [isMacOS, keyBinding]);

  return (
    <div className={styles.keybinding}>
      {fragments.map((fragment, index) => {
        return (
          <div key={index} className={styles.keybindingFragment}>
            {fragment}
          </div>
        );
      })}
    </div>
  );
};
