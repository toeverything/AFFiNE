import { useAtomValue } from 'jotai';

import type { EditorExtensionProps } from '.';
import { editorSidebarActiveExtensionAtom } from './atoms';
import * as styles from './editor-sidebar.css';

export const EditorSidebar = (props: EditorExtensionProps) => {
  const activeExtension = useAtomValue(editorSidebarActiveExtensionAtom);
  const Component = activeExtension?.Component;

  return (
    <div className={styles.root}>
      {Component ? <Component {...props} /> : null}
    </div>
  );
};
