import { ScrollableContainer } from '@affine/component';
import type { CommandCategory } from '@toeverything/infra/command';
import { Command } from 'cmdk';
import { useAtom, useAtomValue } from 'jotai';
import { Suspense, useMemo } from 'react';

import { cmdkQueryAtom, useCMDKCommandGroups } from './data';
import * as styles from './main.css';
import { CMDKModal, type CMDKModalProps } from './modal';
import { CMDKContainer } from './panel';
import type { CMDKCommand } from './types';
import { currentWorkspaceIdAtom } from '@toeverything/infra/atom';

const QuickSearchGroup = ({
  category,
  commands,
}: {
  category: CommandCategory;
  commands: CMDKCommand[];
}) => {
  const query = useAtomValue(cmdkQueryAtom);
  const filteredCommands = useMemo(() => {
    return commands.filter(command => {
      return !query || command.label?.includes(query);
    });
  }, [commands, query]);

  return (
    <Command.Group key={category} heading={category}>
      {filteredCommands.map(command => {
        return (
          <Command.Item key={command.id} value={command.value}>
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

export const CMDKQuickSearchModal = (props: CMDKModalProps) => {
  const [query, setQuery] = useAtom(cmdkQueryAtom);
  console.log(useAtomValue(currentWorkspaceIdAtom));
  return (
    <CMDKModal {...props}>
      <CMDKContainer
        className={styles.root}
        query={query}
        onQueryChange={setQuery}
      >
        <Suspense>
          <ScrollableContainer>
            <QuickSearchCommands />
          </ScrollableContainer>
        </Suspense>
      </CMDKContainer>
    </CMDKModal>
  );
};
