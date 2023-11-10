import { Command } from '@affine/cmdk';
import { formatDate } from '@affine/component/page-list';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { PageMeta } from '@blocksuite/store';
import { useAsyncCallback } from '@toeverything/hooks/affine-async-hooks';
import type { CommandCategory } from '@toeverything/infra/command';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { Suspense, useLayoutEffect, useMemo, useState } from 'react';

import {
  cmdkQueryAtom,
  cmdkValueAtom,
  customCommandFilter,
  useCMDKCommandGroups,
} from './data';
import { HighlightLabel } from './highlight';
import * as styles from './main.css';
import { CMDKModal, type CMDKModalProps } from './modal';
import { NotFoundGroup } from './not-found';
import type { CMDKCommand } from './types';

type NoParametersKeys<T> = {
  [K in keyof T]: T[K] extends () => any ? K : never;
}[keyof T];

type i18nKey = NoParametersKeys<ReturnType<typeof useAFFiNEI18N>>;

const categoryToI18nKey: Record<CommandCategory, i18nKey> = {
  'affine:recent': 'com.affine.cmdk.affine.category.affine.recent',
  'affine:navigation': 'com.affine.cmdk.affine.category.affine.navigation',
  'affine:creation': 'com.affine.cmdk.affine.category.affine.creation',
  'affine:general': 'com.affine.cmdk.affine.category.affine.general',
  'affine:layout': 'com.affine.cmdk.affine.category.affine.layout',
  'affine:pages': 'com.affine.cmdk.affine.category.affine.pages',
  'affine:edgeless': 'com.affine.cmdk.affine.category.affine.edgeless',
  'affine:collections': 'com.affine.cmdk.affine.category.affine.collections',
  'affine:settings': 'com.affine.cmdk.affine.category.affine.settings',
  'affine:updates': 'com.affine.cmdk.affine.category.affine.updates',
  'affine:help': 'com.affine.cmdk.affine.category.affine.help',
  'editor:edgeless': 'com.affine.cmdk.affine.category.editor.edgeless',
  'editor:insert-object':
    'com.affine.cmdk.affine.category.editor.insert-object',
  'editor:page': 'com.affine.cmdk.affine.category.editor.page',
};

const QuickSearchGroup = ({
  category,
  commands,
  onOpenChange,
}: {
  category: CommandCategory;
  commands: CMDKCommand[];
  onOpenChange?: (open: boolean) => void;
}) => {
  const t = useAFFiNEI18N();
  const i18nkey = categoryToI18nKey[category];
  const [query, setQuery] = useAtom(cmdkQueryAtom);

  const onCommendSelect = useAsyncCallback(
    async (command: CMDKCommand) => {
      try {
        await command.run();
      } finally {
        setQuery('');
        onOpenChange?.(false);
      }
    },
    [setQuery, onOpenChange]
  );

  return (
    <Command.Group key={category} heading={t[i18nkey]()}>
      {commands.map(command => {
        const label =
          typeof command.label === 'string'
            ? {
                title: command.label,
              }
            : command.label;
        return (
          <Command.Item
            key={command.id}
            onSelect={() => onCommendSelect(command)}
            value={command.value}
            data-is-danger={
              command.id === 'editor:page-move-to-trash' ||
              command.id === 'editor:edgeless-move-to-trash'
            }
          >
            <div className={styles.itemIcon}>{command.icon}</div>
            <div
              data-testid="cmdk-label"
              className={styles.itemLabel}
              data-value={
                command.originalValue ? command.originalValue : undefined
              }
            >
              <HighlightLabel highlight={query} label={label} />
            </div>
            {command.timestamp ? (
              <div className={styles.timestamp}>
                {formatDate(new Date(command.timestamp))}
              </div>
            ) : null}
            {command.keyBinding ? (
              <CMDKKeyBinding
                keyBinding={
                  typeof command.keyBinding === 'string'
                    ? command.keyBinding
                    : command.keyBinding.binding
                }
              />
            ) : null}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
};

const QuickSearchCommands = ({
  onOpenChange,
}: {
  onOpenChange?: (open: boolean) => void;
}) => {
  const groups = useCMDKCommandGroups();

  return groups.map(([category, commands]) => {
    return (
      <QuickSearchGroup
        key={category}
        onOpenChange={onOpenChange}
        category={category}
        commands={commands}
      />
    );
  });
};

export const CMDKContainer = ({
  className,
  onQueryChange,
  query,
  children,
  pageMeta,
  open,
  ...rest
}: React.PropsWithChildren<{
  open: boolean;
  className?: string;
  query: string;
  pageMeta?: PageMeta;
  onQueryChange: (query: string) => void;
}>) => {
  const t = useAFFiNEI18N();
  const [value, setValue] = useAtom(cmdkValueAtom);
  const isInEditor = pageMeta !== undefined;
  const [opening, setOpening] = useState(open);

  // fix list height animation on openning
  useLayoutEffect(() => {
    if (open) {
      setOpening(true);
      const timeout = setTimeout(() => {
        setOpening(false);
      }, 150);
      return () => {
        clearTimeout(timeout);
      };
    } else {
      setOpening(false);
    }
    return;
  }, [open]);

  return (
    <Command
      {...rest}
      data-testid="cmdk-quick-search"
      filter={customCommandFilter}
      className={clsx(className, styles.panelContainer)}
      value={value}
      onValueChange={setValue}
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
      {isInEditor ? (
        <div className={styles.pageTitleWrapper}>
          <span className={styles.pageTitle}>
            {pageMeta.title ? pageMeta.title : t['Untitled']()}
          </span>
        </div>
      ) : null}
      <Command.Input
        placeholder={t['com.affine.cmdk.placeholder']()}
        autoFocus
        {...rest}
        value={query}
        onValueChange={onQueryChange}
        className={clsx(className, styles.searchInput, {
          inEditor: isInEditor,
        })}
      />
      <Command.List data-opening={opening ? true : undefined}>
        {children}
      </Command.List>
      <NotFoundGroup />
    </Command>
  );
};

export const CMDKQuickSearchModal = ({
  pageMeta,
  open,
  ...props
}: CMDKModalProps & { pageMeta?: PageMeta }) => {
  const [query, setQuery] = useAtom(cmdkQueryAtom);
  useLayoutEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open, setQuery]);
  return (
    <CMDKModal open={open} {...props}>
      <CMDKContainer
        className={styles.root}
        query={query}
        onQueryChange={setQuery}
        pageMeta={pageMeta}
        open={open}
      >
        <Suspense fallback={<Command.Loading />}>
          <QuickSearchCommands onOpenChange={props.onOpenChange} />
        </Suspense>
      </CMDKContainer>
    </CMDKModal>
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
