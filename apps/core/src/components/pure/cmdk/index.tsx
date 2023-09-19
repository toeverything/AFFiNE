import { useMemo, useState } from 'react';

import { getCommands } from './data';
import { CMDKModal, type CMDKModalProps } from './modal';
import { CMDKPanelContainer } from './panel';

export const CMDKQuickSearchModal = (props: CMDKModalProps) => {
  const [query, setQuery] = useState('');
  const commands = useMemo(() => getCommands(), []);
  return (
    <CMDKModal {...props}>
      <CMDKPanelContainer query={query} onQueryChange={setQuery}>
        {commands.map(command => {
          return <div key={command.id}>{command.id}</div>;
        })}
      </CMDKPanelContainer>
    </CMDKModal>
  );
};

export * from './modal';
export * from './panel';
