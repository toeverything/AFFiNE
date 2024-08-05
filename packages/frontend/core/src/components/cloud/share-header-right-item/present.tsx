import { Button } from '@affine/component/ui/button';
import { useI18n } from '@affine/i18n';
import { PresentationIcon } from '@blocksuite/icons/rc';

import { usePresent } from '../../blocksuite/block-suite-header/present/use-present';
import * as styles from './styles.css';

export const PresentButton = () => {
  const t = useI18n();
  const { isPresent, handlePresent } = usePresent();

  return (
    <Button
      prefix={<PresentationIcon />}
      className={styles.presentButton}
      onClick={() => handlePresent()}
      disabled={isPresent}
    >
      {t['com.affine.share-page.header.present']()}
    </Button>
  );
};
