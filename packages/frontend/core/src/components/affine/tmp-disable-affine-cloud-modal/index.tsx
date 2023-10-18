import { Empty } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Modal, type ModalProps } from '@toeverything/components/modal';
import { useCallback } from 'react';

import {
  StyleButton,
  StyleButtonContainer,
  StyleImage,
  StyleTips,
} from './style';

export const TmpDisableAffineCloudModal = (props: ModalProps) => {
  const t = useAFFiNEI18N();
  const onClose = useCallback(() => {
    props.onOpenChange?.(false);
  }, [props]);
  return (
    <Modal
      title={t['com.affine.cloudTempDisable.title']()}
      contentOptions={{
        ['data-testid' as string]: 'disable-affine-cloud-modal',
      }}
      width={480}
      {...props}
    >
      <StyleTips>
        <Trans i18nKey="com.affine.cloudTempDisable.description">
          We are upgrading the AFFiNE Cloud service and it is temporarily
          unavailable on the client side. If you wish to stay updated on the
          progress and be notified on availability, you can fill out the
          <a
            href="https://6dxre9ihosp.typeform.com/to/B8IHwuyy"
            rel="noreferrer"
            target="_blank"
            style={{
              color: 'var(--affine-link-color)',
            }}
          >
            AFFiNE Cloud Signup
          </a>
          .
        </Trans>
      </StyleTips>
      <StyleImage>
        <Empty
          containerStyle={{
            width: '200px',
            height: '112px',
          }}
        />
      </StyleImage>
      <StyleButtonContainer>
        <StyleButton type="primary" onClick={onClose}>
          {t['Got it']()}
        </StyleButton>
      </StyleButtonContainer>
    </Modal>
  );
};
