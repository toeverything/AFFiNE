import { TodayIcon } from '@blocksuite/icons';

import type { EditorExtension } from '..';

const EditorJournalPanel = () => {
  return <div>journal extension</div>;
};

export const journalExtension: EditorExtension = {
  name: 'journal',
  icon: <TodayIcon />,
  Component: EditorJournalPanel,
};
