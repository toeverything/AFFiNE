import {
  Button,
  type ButtonProps,
  Input,
  Modal,
  notify,
} from '@affine/component';
import { useAsyncCallback } from '@affine/core/components/hooks/affine-async-hooks';
import { IntegrationService } from '@affine/core/modules/integration';
import { Trans, useI18n } from '@affine/i18n';
import { ReadwiseLogoDuotoneIcon } from '@blocksuite/icons/rc';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type FormEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

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
import { readwiseTrack } from './track';

const ConnectDialog = ({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: (token: string) => void;
}) => {
  const t = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
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
      readwiseTrack.connectIntegration({
        result: success ? 'success' : 'failed',
      });
      if (success) {
        onSuccess(token);
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
    [onSuccess, t]
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

  useEffect(() => {
    const onFocus = () => inputRef.current?.focus();
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
    };
  }, []);

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
            br: <br />,
          }}
        />
      </div>
      <Input
        ref={inputRef}
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

export const ReadwiseConnectButton = ({
  onSuccess,
  className,
  onClick,
  ...buttonProps
}: {
  onSuccess: (token: string) => void;
} & ButtonProps) => {
  const t = useI18n();
  const [open, setOpen] = useState(false);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  const handleOpen = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      setOpen(true);
    },
    [onClick]
  );

  return (
    <>
      {open && <ConnectDialog onClose={handleClose} onSuccess={onSuccess} />}
      <Button
        className={clsx(actionButton, className)}
        onClick={handleOpen}
        {...buttonProps}
      >
        {t['com.affine.integration.readwise.connect']()}
      </Button>
    </>
  );
};
