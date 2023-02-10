import { useState } from 'react';
import { Button } from '@affine/component';
import { Input } from '@affine/component';
import { toast } from '@affine/component';
import { WorkspaceUnit } from '@affine/datacenter';
import { useWorkspaceHelper } from '@/hooks/use-workspace-helper';
import { useTranslation } from '@affine/i18n';
import { Wrapper, Content, FlexWrapper } from '@affine/component';
import { useModal } from '@/store/globalModal';
export const PublishPage = ({ workspace }: { workspace: WorkspaceUnit }) => {
  const shareUrl = window.location.host + '/public-workspace/' + workspace.id;
  const { publishWorkspace } = useWorkspaceHelper();
  const { triggerEnableWorkspaceModal } = useModal();
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState(false);
  const togglePublic = async (flag: boolean) => {
    try {
      await publishWorkspace(workspace.id.toString(), flag);
      setLoaded(false);
    } catch (e) {
      toast(t('Failed to publish workspace'));
    }
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    toast(t('Copied link to clipboard'));
  };

  if (workspace.provider === 'affine') {
    if (workspace.published) {
      return (
        <>
          <Wrapper marginBottom="32px">{t('Published Description')}</Wrapper>

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
              setLoaded(true);
              await togglePublic(false);
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
        <Wrapper marginBottom="32px">{t('Publishing Description')}</Wrapper>
        <Button
          onClick={async () => {
            setLoaded(true);
            await togglePublic(true);
          }}
          loading={loaded}
          type="light"
          shape="circle"
        >
          {t('Publish to web')}
        </Button>
      </>
    );
  }

  return (
    <>
      <Wrapper marginBottom="32px">{t('Publishing')}</Wrapper>
      <Button
        type="light"
        shape="circle"
        onClick={async () => {
          triggerEnableWorkspaceModal();
        }}
      >
        {t('Enable AFFiNE Cloud')}
      </Button>
    </>
  );
};
