import { useAtomValue } from 'jotai';

import { editorSidebarStateAtom } from './atoms';
import * as styles from './editor-sidebar.css';

export const EditorSidebar = () => {
  const sidebarState = useAtomValue(editorSidebarStateAtom);
  const Component = sidebarState.activeExtension?.Component;

  return <div className={styles.root}>{Component ? <Component /> : null}</div>;
};
