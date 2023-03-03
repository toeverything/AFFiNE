import {
  Button,
  Content,
  FlexWrapper,
  Input,
  toast,
  Wrapper,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import React, { useCallback, useEffect, useState } from 'react';

import { lockMutex } from '../../../../../atoms';
import { useToggleWorkspacePublish } from '../../../../../hooks/affine/use-toggle-workspace-publish';
import {
  AffineOfficialWorkspace,
  AffineWorkspace,
  LocalWorkspace,
  RemWorkspaceFlavour,
} from '../../../../../shared';
import { Unreachable } from '../../../affine-error-eoundary';
import { EnableAffineCloudModal } from '../../../enable-affine-cloud-modal';

export type PublishPanelProps = {
  workspace: AffineOfficialWorkspace;
};

export type PublishPanelAffineProps = {
  workspace: AffineWorkspace;
};

const PublishPanelAffine: React.FC<PublishPanelAffineProps> = ({
  workspace,
}) => {
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : ''
    );
  }, []);
  const shareUrl = origin + '/public-workspace/' + workspace.id;
  const { t } = useTranslation();
  const publishWorkspace = useToggleWorkspacePublish(workspace);
  const copyUrl = useCallback(() => {
    navigator.clipboard.writeText(shareUrl);
    toast(t('Copied link to clipboard'));
  }, [shareUrl, t]);

  const [open, setOpen] = useState(false);

  if (workspace.public) {
    return (
      <>
        <Wrapper marginBottom="42px">{t('Published Description')}</Wrapper>

        <Wrapper marginBottom="12px">
          <Content weight="500">{t('Share with link')}</Content>
        </Wrapper>
        <FlexWrapper>
          <Input width={582} value={shareUrl} disabled={true}></Input>
          <Button
            onClick={copyUrl}
            type="light"
            shape="circle"
            style={{ marginLeft: '24px' }}
          >
            {t('Copy Link')}
          </Button>
        </FlexWrapper>
        <Button
          onClick={async () => {
            lockMutex(async () => {
              return publishWorkspace(false);
            });
          }}
          loading={false}
          type="danger"
          shape="circle"
          style={{ marginTop: '38px' }}
        >
          {t('Stop publishing')}
        </Button>
      </>
    );
  }
  return (
    <>
      <Wrapper marginBottom="42px">{t('Publishing Description')}</Wrapper>
      <Button
        onClick={() => {
          setOpen(true);
        }}
        type="light"
        shape="circle"
      >
        {t('Publish to web')}
      </Button>
      <EnableAffineCloudModal
        workspace={workspace}
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          lockMutex(async () => {
            return publishWorkspace(true);
          }).then(() => {
            setOpen(false);
          });
        }}
      />
    </>
  );
};

export type PublishPanelLocalProps = {
  workspace: LocalWorkspace;
};

const PublishPanelLocal: React.FC<PublishPanelLocalProps> = ({ workspace }) => {
  const { t } = useTranslation();
  return (
    <>
      <Wrapper marginBottom="42px">{t('Publishing')}</Wrapper>
      <Button
        type="light"
        shape="circle"
        onClick={async () => {
          // fixme: regression
          toast('You need to enable AFFiNE Cloud to use this feature.');
        }}
      >
        {t('Enable AFFiNE Cloud')}
      </Button>
    </>
  );
};

export const PublishPanel: React.FC<PublishPanelProps> = ({ workspace }) => {
  if (workspace.flavour === RemWorkspaceFlavour.AFFINE) {
    return <PublishPanelAffine workspace={workspace} />;
  } else if (workspace.flavour === RemWorkspaceFlavour.LOCAL) {
    return <PublishPanelLocal workspace={workspace} />;
  }
  throw new Unreachable();
};
