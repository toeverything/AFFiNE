import { Button, Modal } from '@affine/component';
import { IntegrationService } from '@affine/core/modules/integration';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import * as styles from './connected.css';
import { ImportDialog } from './import-dialog';
import { actionButton } from './index.css';

export const DisconnectDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useI18n();
  const readwise = useService(IntegrationService).readwise;

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) onClose();
    },
    [onClose]
  );
  const handleCancel = useCallback(() => onClose(), [onClose]);
  const handleKeep = useCallback(() => {
    readwise.disconnect();
    onClose();
  }, [onClose, readwise]);
  // const handleDelete = useAsyncCallback(async () => {
  //   // TODO
  // }, []);

  return (
    <Modal
      open={true}
      onOpenChange={onOpenChange}
      contentOptions={{ className: styles.connectDialog }}
    >
      <div className={styles.connectDialogTitle}>
        {t['com.affine.integration.readwise.disconnect.title']()}
      </div>
      <div className={styles.connectDialogDesc}>
        {t['com.affine.integration.readwise.disconnect.desc']()}
      </div>
      <footer className={styles.footer}>
        <Button onClick={handleCancel}>{t['Cancel']()}</Button>
        <div className={styles.actions}>
          <Button variant="error">
            {t['com.affine.integration.readwise.disconnect.delete']()}
          </Button>
          <Button variant="primary" onClick={handleKeep}>
            {t['com.affine.integration.readwise.disconnect.keep']()}
          </Button>
        </div>
      </footer>
    </Modal>
  );
};

export const ConnectedActions = () => {
  const t = useI18n();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  return (
    <>
      {showDisconnectDialog && (
        <DisconnectDialog onClose={() => setShowDisconnectDialog(false)} />
      )}
      {showImportDialog && (
        <ImportDialog onClose={() => setShowImportDialog(false)} />
      )}
      <Button
        className={actionButton}
        onClick={() => setShowImportDialog(true)}
      >
        {t['com.affine.integration.readwise.import']()}
      </Button>
      <Button
        variant="error"
        className={actionButton}
        onClick={() => setShowDisconnectDialog(true)}
      >
        {t['com.affine.integration.readwise.disconnect']()}
      </Button>
    </>
  );
};
