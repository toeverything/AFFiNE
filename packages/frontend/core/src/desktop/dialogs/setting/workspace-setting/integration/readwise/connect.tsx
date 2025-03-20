import { Button, Input, Modal, notify } from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { IntegrationService } from '@affine/core/modules/integration';
import { Trans, useI18n } from '@affine/i18n';
import { ReadwiseLogoDuotoneIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import { type FormEvent, useCallback, useState } from 'react';

import { IntegrationCardIcon } from '../card';
import {
  actionButton,
  connectDesc,
  connectDialog,
  connectFooter,
  connectInput,
  connectTitle,
  getTokenLink,
  inputErrorMsg,
} from './index.css';

const ConnectDialog = ({ onClose }: { onClose: () => void }) => {
  const t = useI18n();
  const [status, setStatus] = useState<'idle' | 'verifying' | 'error'>('idle');
  const [token, setToken] = useState('');
  const readwise = useService(IntegrationService).readwise;

  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open) handleCancel();
    },
    [handleCancel]
  );

  const handleInput = useCallback((e: FormEvent<HTMLInputElement>) => {
    setToken(e.currentTarget.value);
    setStatus('idle');
  }, []);

  const handleResult = useCallback(
    (success: boolean, token: string) => {
      if (success) {
        readwise.updateSetting('token', token);
      } else {
        setStatus('error');
        notify.error({
          title:
            t['com.affine.integration.readwise.connect.error-notify-title'](),
          message:
            t['com.affine.integration.readwise.connect.error-notify-desc'](),
        });
      }
    },
    [readwise, t]
  );

  const handleConnect = useAsyncCallback(
    async (token: string) => {
      setStatus('verifying');
      try {
        const success = await readwise.crawler.verifyToken(token);
        if (!success) return handleResult(false, token);
      } catch (err) {
        console.error(err);
        return handleResult(false, token);
      }
      handleResult(true, token);
    },
    [handleResult, readwise]
  );

  return (
    <Modal
      open={true}
      onOpenChange={onOpenChange}
      contentOptions={{ className: connectDialog }}
    >
      <header className={connectTitle}>
        <IntegrationCardIcon>
          <ReadwiseLogoDuotoneIcon />
        </IntegrationCardIcon>
        {t['com.affine.integration.readwise.connect.title']()}
      </header>
      <div className={connectDesc}>
        <Trans
          i18nKey={'com.affine.integration.readwise.connect.desc'}
          components={{
            a: (
              <a
                href="https://readwise.io/access_token"
                target="_blank"
                rel="noreferrer"
                className={getTokenLink}
              />
            ),
          }}
        />
      </div>
      <Input
        value={token}
        onInput={handleInput}
        placeholder={t['com.affine.integration.readwise.connect.placeholder']()}
        type="password"
        className={connectInput}
        status={status === 'error' ? 'error' : 'default'}
        disabled={status === 'verifying'}
        autoFocus
      />
      <div className={inputErrorMsg} data-show={status === 'error'}>
        {t['com.affine.integration.readwise.connect.input-error']()}
      </div>
      <footer className={connectFooter}>
        <Button disabled={status === 'verifying'} onClick={handleCancel}>
          {t['Cancel']()}
        </Button>
        <Button
          variant="primary"
          disabled={status === 'verifying' || !token || status === 'error'}
          loading={status === 'verifying'}
          onClick={() => handleConnect(token)}
        >
          {t['com.affine.integration.readwise.connect']()}
        </Button>
      </footer>
    </Modal>
  );
};

export const ConnectButton = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleOpen = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <>
      {open && <ConnectDialog onClose={handleClose} />}
      <Button variant="primary" className={actionButton} onClick={handleOpen}>
        {t['com.affine.integration.readwise.connect']()}
      </Button>
    </>
  );
};
