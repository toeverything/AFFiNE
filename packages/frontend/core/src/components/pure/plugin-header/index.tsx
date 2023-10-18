import {
  addCleanup,
  pluginHeaderItemAtom,
} from '@toeverything/infra/__internal__/plugin';
import { useAtomValue } from 'jotai';
import { startTransition, useCallback, useRef } from 'react';

import * as styles from './styles.css';
export const PluginHeader = () => {
  const headerItem = useAtomValue(pluginHeaderItemAtom);
  const pluginsRef = useRef<string[]>([]);

  return (
    <div
      className={styles.pluginHeaderItems}
      ref={useCallback(
        (root: HTMLDivElement | null) => {
          if (root) {
            Object.entries(headerItem).forEach(([pluginName, create]) => {
              if (pluginsRef.current.includes(pluginName)) {
                return;
              }
              pluginsRef.current.push(pluginName);
              const div = document.createElement('div');
              div.setAttribute('plugin-id', pluginName);
              startTransition(() => {
                const cleanup = create(div);
                root.appendChild(div);
                addCleanup(pluginName, () => {
                  pluginsRef.current = pluginsRef.current.filter(
                    name => name !== pluginName
                  );
                  root.removeChild(div);
                  cleanup();
                });
              });
            });
          }
        },
        [headerItem]
      )}
    />
  );
};
