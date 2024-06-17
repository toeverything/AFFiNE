import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FavoriteIcon } from '@blocksuite/icons/rc';

import * as styles from './styles.css';
export const EmptyItem = () => {
  const t = useAFFiNEI18N();
  return (
    <div className={styles.emptyFavouritesContent}>
      <div className={styles.emptyFavouritesIconWrapper}>
        <FavoriteIcon className={styles.emptyFavouritesIcon} />
      </div>
      <div
        data-testid="slider-bar-favourites-empty-message"
        className={styles.emptyFavouritesMessage}
      >
        {t['com.affine.rootAppSidebar.favorites.empty']()}
      </div>
    </div>
  );
};

export default EmptyItem;
