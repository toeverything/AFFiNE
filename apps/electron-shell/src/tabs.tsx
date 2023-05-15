import { CloseIcon, PlusIcon } from '@blocksuite/icons';

import { useActiveTabId, useTabIds } from './states';
import * as styles from './tabs.css';

export function Tabs() {
  const tabIds = useTabIds();
  const activeTabId = useActiveTabId();
  const canClose = tabIds.length > 1;

  return (
    <div className={styles.root}>
      <div className={styles.container}>
        {tabIds.map(id => {
          if (id === 'shell') return null;
          return (
            <div
              key={id}
              className={styles.tab}
              data-active={id === activeTabId}
              onClick={() => {
                window.apis?.ui.showTab(id);
              }}
            >
              {id.substring(0, 4)}

              {canClose && (
                <button
                  className={styles.closeButton}
                  onClick={() => {
                    window.apis?.ui.removeTab(id);
                  }}
                >
                  <CloseIcon />
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => {
            window.apis?.ui.addNewTab();
          }}
          className={styles.plusButton}
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  );
}
