import {
  Button,
  Content,
  FlexWrapper,
  Input,
  toast,
  Wrapper,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { Box } from '@mui/material';
import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

import { useToggleWorkspacePublish } from '../../../../../hooks/affine/use-toggle-workspace-publish';
import type {
  AffineOfficialWorkspace,
  AffineWorkspace,
  LocalWorkspace,
} from '../../../../../shared';
import { RemWorkspaceFlavour } from '../../../../../shared';
import { Unreachable } from '../../../affine-error-eoundary';
import { EnableAffineCloudModal } from '../../../enable-affine-cloud-modal';
import type { WorkspaceSettingDetailProps } from '../../index';

export type PublishPanelProps = WorkspaceSettingDetailProps & {
  workspace: AffineOfficialWorkspace;
};

export type PublishPanelAffineProps = WorkspaceSettingDetailProps & {
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
            await publishWorkspace(false);
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
          publishWorkspace(true);
        }}
        type="light"
        shape="circle"
      >
        {t('Publish to web')}
      </Button>
    </>
  );
};

export type PublishPanelLocalProps = WorkspaceSettingDetailProps & {
  workspace: LocalWorkspace;
};

const PublishPanelLocal: React.FC<PublishPanelLocalProps> = ({
  workspace,
  onTransferWorkspace,
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Box
        sx={{
          marginBottom: '42px',
        }}
      >
        {t('Publishing')}
      </Box>
      <Button
        type="light"
        shape="circle"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t('Enable AFFiNE Cloud')}
      </Button>
      <EnableAffineCloudModal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        onConfirm={() => {
          onTransferWorkspace(
            RemWorkspaceFlavour.LOCAL,
            RemWorkspaceFlavour.AFFINE,
            workspace
          );
          setOpen(false);
        }}
      />
    </>
  );
};

export const PublishPanel: React.FC<PublishPanelProps> = props => {
  if (props.workspace.flavour === RemWorkspaceFlavour.AFFINE) {
    return <PublishPanelAffine {...props} workspace={props.workspace} />;
  } else if (props.workspace.flavour === RemWorkspaceFlavour.LOCAL) {
    return <PublishPanelLocal {...props} workspace={props.workspace} />;
  }
  throw new Unreachable();
};
