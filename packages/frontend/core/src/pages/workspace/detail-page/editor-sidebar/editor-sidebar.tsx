import { useAtomValue } from 'jotai';

import { editorSidebarStateAtom } from './atoms';
import * as styles from './editor-sidebar.css';

export const EditorSidebar = () => {
  const sidebarState = useAtomValue(editorSidebarStateAtom);
  const Component = sidebarState.activeExtension?.Component;

  // do we need this?
  if (!sidebarState.isOpen) {
    return null;
  }

  return <div className={styles.root}>{Component ? <Component /> : null}</div>;
};
