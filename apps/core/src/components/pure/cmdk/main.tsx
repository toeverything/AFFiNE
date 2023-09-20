import { Command } from '@affine/cmdk';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { CommandCategory } from '@toeverything/infra/command';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import { Suspense } from 'react';

import { cmdkQueryAtom, useCMDKCommandGroups } from './data';
import * as styles from './main.css';
import { CMDKModal, type CMDKModalProps } from './modal';
import type { CMDKCommand } from './types';

const QuickSearchGroup = ({
  category,
  commands,
}: {
  category: CommandCategory;
  commands: CMDKCommand[];
}) => {
  return (
    <Command.Group key={category} heading={category}>
      {commands.map(command => {
        return (
          <Command.Item key={command.id}>
            {command.icon}
            {command.label}
          </Command.Item>
        );
      })}
    </Command.Group>
  );
};

const QuickSearchCommands = () => {
  const groups = useCMDKCommandGroups();

  return groups.map(([category, commands]) => {
    return (
      <QuickSearchGroup
        key={category}
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
  ...rest
}: React.PropsWithChildren<{
  className: string;
  query: string;
  onQueryChange: (query: string) => void;
}>) => {
  const t = useAFFiNEI18N();
  return (
    <Command
      {...rest}
      shouldFilter
      className={clsx(className, styles.panelContainer)}
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
      <Command.Input
        placeholder={t['com.affine.cmdk.placeholder']()}
        autoFocus
        {...rest}
        value={query}
        onValueChange={onQueryChange}
        className={clsx(className, styles.searchInput)}
      />
      <Command.List>{children}</Command.List>
    </Command>
  );
};

export const CMDKQuickSearchModal = (props: CMDKModalProps) => {
  const [query, setQuery] = useAtom(cmdkQueryAtom);
  return (
    <CMDKModal {...props}>
      <CMDKContainer
        className={styles.root}
        query={query}
        onQueryChange={setQuery}
      >
        <Suspense fallback={<Command.Loading />}>
          <QuickSearchCommands />
        </Suspense>
      </CMDKContainer>
    </CMDKModal>
  );
};
