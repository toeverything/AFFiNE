import { Button } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { ReactElement } from 'react';

import * as styles from './collection-list-header.css';

export const CollectionListHeader = ({
  node,
  onCreate,
}: {
  node: ReactElement | null;
  onCreate: () => void;
}) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <div className={styles.collectionListHeader}>
        <div className={styles.collectionListHeaderTitle}>
          {t['com.affine.collections.header']()}
        </div>
        <Button className={styles.newCollectionButton} onClick={onCreate}>
          {t['com.affine.collections.empty.new-collection-button']()}
        </Button>
      </div>
      {node}
    </>
  );
};
