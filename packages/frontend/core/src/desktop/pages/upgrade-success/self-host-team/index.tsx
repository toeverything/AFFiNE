import { Button, IconButton, Loading, notify } from '@affine/component';
import { AuthPageContainer } from '@affine/component/auth-components';
import { SelfhostGenerateLicenseService } from '@affine/core/modules/cloud';
import { OpenInAppService } from '@affine/core/modules/open-in-app';
import { copyTextToClipboard } from '@affine/core/utils/clipboard';
import { Trans, useI18n } from '@affine/i18n';
import { CopyIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageNotFound } from '../../404';
import * as styles from './styles.css';

/**
 * /upgrade-success/self-hosted-team page
 *
 * only on web
 */
export const Component = () => {
  const [params] = useSearchParams();
  const sessionId = params.get('session_id');
  const selfhostGenerateLicenseService = useService(
    SelfhostGenerateLicenseService
  );
  const isMutating = useLiveData(selfhostGenerateLicenseService.isLoading$);
  const key = useLiveData(selfhostGenerateLicenseService.licenseKey$);
  const error = useLiveData(selfhostGenerateLicenseService.error$);

  useEffect(() => {
    if (isMutating || error) {
      return;
    }
    if (sessionId && !key) {
      selfhostGenerateLicenseService.generateLicenseKey(sessionId);
    }
  }, [error, isMutating, key, selfhostGenerateLicenseService, sessionId]);

  if (!sessionId) {
    return <PageNotFound noPermission />;
  }
  if (isMutating || key) {
    return <Success licenseKey={key} />;
  } else {
    return (
      <AuthPageContainer
        title={'failed to generate license key'}
        subtitle={error?.message}
      ></AuthPageContainer>
    );
  }
};

const Success = ({ licenseKey }: { licenseKey: string | null }) => {
  const t = useI18n();
  const openInAppService = useService(OpenInAppService);

  const openAFFiNE = useCallback(() => {
    openInAppService.showOpenInAppPage();
  }, [openInAppService]);

  const onCopy = useCallback(() => {
    if (!licenseKey) {
      notify.error({ title: 'Copy failed, please try again later' });
      return;
    }
    copyTextToClipboard(licenseKey)
      .then(success => {
        if (success) {
          notify.success({
            title: t['com.affine.payment.license-success.copy'](),
          });
        }
      })
      .catch(err => {
        console.error(err);
        notify.error({ title: 'Copy failed, please try again later' });
      });
  }, [licenseKey, t]);

  const subtitle = (
    <span className={styles.leftContentText}>
      <span>{t['com.affine.payment.license-success.text-1']()}</span>
      <span>
        <Trans
          i18nKey={'com.affine.payment.license-success.text-2'}
          components={{
            1: (
              <a
                href="mailto:support@toeverything.info"
                className={styles.mail}
              />
            ),
          }}
        />
      </span>
    </span>
  );
  return (
    <AuthPageContainer
      title={t['com.affine.payment.license-success.title']()}
      subtitle={subtitle}
    >
      <div className={styles.content}>
        <div className={styles.licenseKeyContainer}>
          {licenseKey ? licenseKey : <Loading />}
          <IconButton
            icon={<CopyIcon />}
            className={styles.icon}
            size="20"
            tooltip={t['Copy']()}
            onClick={onCopy}
          />
        </div>
        <div>{t['com.affine.payment.license-success.hint']()}</div>
        <div>
          <Button variant="primary" size="extraLarge" onClick={openAFFiNE}>
            {t['com.affine.payment.license-success.open-affine']()}
          </Button>
        </div>
      </div>
    </AuthPageContainer>
  );
};
