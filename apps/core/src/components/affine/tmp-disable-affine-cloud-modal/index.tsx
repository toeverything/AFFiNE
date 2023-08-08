import { Empty, Modal, ModalWrapper } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';

import {
  Content,
  ContentTitle,
  Header,
  StyleButton,
  StyleButtonContainer,
  StyleImage,
  StyleTips,
} from './style';

interface TmpDisableAffineCloudModalProps {
  open: boolean;
  onClose: () => void;
}

export const TmpDisableAffineCloudModal = ({
  open,
  onClose,
}: TmpDisableAffineCloudModalProps) => {
  const t = useAFFiNEI18N();

  return (
    <Modal
      data-testid="disable-affine-cloud-modal"
      open={open}
      onClose={onClose}
    >
      <ModalWrapper width={480}>
        <Header>
          <IconButton onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </Header>
        <Content>
          <ContentTitle>
            {t['com.affine.cloudTempDisable.title']()}
          </ContentTitle>
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
        </Content>
      </ModalWrapper>
    </Modal>
  );
};
