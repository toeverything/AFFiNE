import { Modal, ModalWrapper } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import * as styles from './styles.css';

export const DesktopLoginModal = ({
  signingEmail,
}: {
  signingEmail?: string;
}) => {
  const t = useAFFiNEI18N();
  return (
    <Modal open={!!signingEmail}>
      <ModalWrapper className={styles.root}>
        <div className={styles.title}>
          {t['com.affine.auth.desktop.signing.in']()}
        </div>

        <Trans i18nKey="com.affine.auth.desktop.signing.in.message">
          Signing in with account {signingEmail}
        </Trans>
      </ModalWrapper>
    </Modal>
  );
};
