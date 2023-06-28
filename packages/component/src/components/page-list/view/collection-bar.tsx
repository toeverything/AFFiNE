import {
  PinedIcon,
  PinIcon,
  UnpinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import { useCallback } from 'react';

import { Button } from '../../../ui/button/button';
import { useAllPageSetting } from '../use-all-page-setting';
import * as styles from './collection-bar.css';

export const CollectionBar = () => {
  const setting = useAllPageSetting();
  const pin = useCallback(() => {
    return setting.updateCollection({
      ...setting.currentCollection,
      pinned: !setting.currentCollection.pinned,
    });
  }, [setting]);
  const collection = setting.currentCollection;
  return !setting.isDefault ? (
    <tr style={{ userSelect: 'none' }}>
      <td>
        <div className={styles.view}>
          <ViewLayersIcon
            style={{
              height: 20,
              width: 20,
            }}
          />
          <div style={{ marginRight: 10 }}>
            {setting.currentCollection.name}
          </div>
          <div onClick={pin} className={styles.pin}>
            {collection.pinned ? (
              <PinedIcon className={styles.pinedIcon}></PinedIcon>
            ) : (
              <PinIcon className={styles.pinedIcon}></PinIcon>
            )}
            {collection.pinned ? (
              <UnpinIcon className={styles.pinIcon}></UnpinIcon>
            ) : (
              <PinIcon className={styles.pinIcon}></PinIcon>
            )}
          </div>
        </div>
      </td>
      <td></td>
      <td></td>
      <td
        style={{
          display: 'flex',
          justifyContent: 'end',
        }}
      >
        <Button style={{ border: 'none' }} onClick={() => setting.backToAll()}>
          Back to all
        </Button>
      </td>
    </tr>
  ) : null;
};
