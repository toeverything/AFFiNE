import { PinIcon, ViewLayersIcon } from '@blocksuite/icons';
import { useCallback } from 'react';

import { Button } from '../../../ui/button/button';
import { useAllPageSetting } from '../use-all-page-setting';
import * as styles from './view-bar.css';

export const ViewBar = () => {
  const setting = useAllPageSetting();
  const pin = useCallback(() => {
    return setting.updateView({
      ...setting.currentView,
      pinned: !setting.currentView.pinned,
    });
  }, [setting]);
  return !setting.isDefault ? (
    <tr style={{ userSelect: 'none' }}>
      <td>
        <div className={styles.view}>
          <ViewLayersIcon style={{ height: 20, width: 20 }} />
          <div style={{ marginRight: 10 }}>{setting.currentView.name}</div>
          <div onClick={pin} className={styles.pin}>
            <PinIcon></PinIcon>
          </div>
        </div>
      </td>
      <td></td>
      <td></td>
      <td style={{ display: 'flex', justifyContent: 'end' }}>
        <Button style={{ border: 'none' }} onClick={() => setting.backToAll()}>
          Back to all
        </Button>
      </td>
    </tr>
  ) : null;
};
