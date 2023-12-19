import { useAtomValue } from 'jotai';

import { editorSidebarActiveExtensionAtom } from './atoms';
import * as styles from './editor-sidebar.css';

export const EditorSidebar = () => {
  const activeExtension = useAtomValue(editorSidebarActiveExtensionAtom);
  const Component = activeExtension?.Component;

  return <div className={styles.root}>{Component ? <Component /> : null}</div>;
};
