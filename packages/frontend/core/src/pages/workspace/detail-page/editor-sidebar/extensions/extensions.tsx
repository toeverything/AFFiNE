import { IconButton } from '@affine/component';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import { useAtom, useAtomValue } from 'jotai';

import {
  editorExtensionsAtom,
  editorSidebarActiveExtensionAtom,
} from '../atoms';
import * as styles from './extensions.css';

// provide a switcher for active extensions
// will be used in global top header (MacOS) or sidebar (Windows)
export const ExtensionTabs = () => {
  const exts = useAtomValue(editorExtensionsAtom);
  const [selected, setSelected] = useAtom(editorSidebarActiveExtensionAtom);
  const vars = assignInlineVars({
    [styles.activeIdx]: String(
      exts.findIndex(ext => ext.name === selected?.name) ?? 0
    ),
  });
  return (
    <div className={styles.switchRoot} style={vars}>
      {exts.map(extension => {
        return (
          <IconButton
            onClick={() => setSelected(extension.name)}
            key={extension.name}
            data-active={selected?.name === extension.name}
            className={styles.button}
          >
            {extension.icon}
          </IconButton>
        );
      })}
    </div>
  );
};
