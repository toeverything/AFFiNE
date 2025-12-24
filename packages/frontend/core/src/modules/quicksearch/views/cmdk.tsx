import { Loading } from '@affine/component/ui/loading';
import { i18nTime, isI18nString, useI18n } from '@affine/i18n';
import clsx from 'clsx';
import { Command } from 'cmdk';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';

import type { QuickSearchGroup } from '../types/group';
import type { QuickSearchItem } from '../types/item';
import * as styles from './cmdk.css';
import { HighlightText } from './highlight-text';

type Groups = { group?: QuickSearchGroup; items: QuickSearchItem[] }[];

export const CMDK = ({
  className,
  query,
  groups: newGroups = [],
  error,
  inputLabel,
  placeholder,
  loading: newLoading = false,
  loadingProgress,
  onQueryChange,
  onSubmit,
}: React.PropsWithChildren<{
  className?: string;
  query: string;
  error?: ReactNode;
  inputLabel?: ReactNode;
  placeholder?: string;
  loading?: boolean;
  loadingProgress?: number;
  groups?: Groups;
  onSubmit?: (item: QuickSearchItem) => void;
  onQueryChange?: (query: string) => void;
}>) => {
  const [opening, setOpening] = useState(false);
  const [loading, setLoading] = useState(false);

  const [{ groups, selectedValue }, dispatch] = useReducer(
    (
      state: {
        groups: Groups;
        selectedValue: string;
      },
      action:
        | { type: 'select'; payload: string }
        | { type: 'reset-select' }
        | { type: 'update-groups'; payload: Groups }
    ) => {
      // control the currently selected item so that when the item list changes, the selected item remains controllable
      if (action.type === 'select') {
        return {
          ...state,
          selectedValue: action.payload,
        };
      }
      if (action.type === 'reset-select') {
        // reset selected item to the first item
        const firstItem = state.groups.at(0)?.items.at(0)?.id;
        return {
          ...state,
          selectedValue: firstItem ?? '',
        };
      }
      if (action.type === 'update-groups') {
        const prevGroups = state.groups;
        const prevSelectedValue = state.selectedValue;

        const prevFirstItem = prevGroups.at(0)?.items.at(0)?.id;
        const newFirstItem = action.payload.at(0)?.items.at(0)?.id;
        const isSelectingFirstItem = prevSelectedValue === prevFirstItem;
        // if previous selected item is the first item, select the new first item
        if (isSelectingFirstItem) {
          return {
            ...state,
            groups: action.payload,
            selectedValue: newFirstItem ?? '',
          };
        }

        const selectedExists = state.groups.some(({ items }) =>
          items.some(item => item.id === prevSelectedValue)
        );
        // if previous selected item exists in the new list, keep it
        if (selectedExists) {
          return {
            ...state,
            groups: action.payload,
            selectedValue: prevSelectedValue,
          };
        }

        // if previous selected item does not exist in the new list, select the new first item
        return {
          ...state,
          groups: action.payload,
          selectedExists: newFirstItem ?? '',
        };
      }
      return state;
    },
    { groups: [], selectedValue: '' }
  );

  const listRef = useRef<HTMLDivElement>(null);
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

  const handleValueChange = useCallback(
    (query: string) => {
      onQueryChange?.(query);
      dispatch({
        type: 'reset-select',
      });
      requestAnimationFrame(() => {
        if (listRef.current) listRef.current.scrollTop = 0;
      });
    },
    [onQueryChange]
  );

  const handleSelectChange = useCallback(
    (value: string) => {
      dispatch({
        type: 'select',
        payload: value,
      });
    },
    [dispatch]
  );

  useEffect(() => {
    // on group change
    dispatch({
      type: 'update-groups',
      payload: newGroups,
    });
  }, [newGroups]);

  useEffect(() => {
    // debounce loading state
    const timeout = setTimeout(() => setLoading(newLoading), 1000);
    return () => clearTimeout(timeout);
  }, [newLoading]);

  return (
    <Command
      data-testid="cmdk-quick-search"
      shouldFilter={false}
      className={clsx(className, styles.root, styles.panelContainer)}
      value={selectedValue}
      onValueChange={handleSelectChange}
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
          onValueChange={handleValueChange}
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
        {error && <p className={styles.errorMessage}>{error}</p>}
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
        const [title, subTitle] = isI18nString(item.label)
          ? [i18n.t(item.label), null]
          : [
              i18n.t(item.label.title),
              item.label.subTitle ? i18n.t(item.label.subTitle) : null,
            ];

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
  const isMacOS = environment.isMacOs;
  const fragments = useMemo(() => {
    return keyBinding.split('+').map(fragment => {
      if (fragment === '$mod') {
        return isMacOS ? '⌘' : 'Ctrl';
      }
      if (fragment === 'Alt') {
        return isMacOS ? '⌥' : 'Alt';
      }
      if (fragment.startsWith('Key')) {
        return fragment.slice(3);
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
      {fragments.map(fragment => {
        return (
          <div key={fragment} className={styles.keybindingFragment}>
            {fragment}
          </div>
        );
      })}
    </div>
  );
};
