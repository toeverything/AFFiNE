import { FlexWrapper, Input, Switch } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Unreachable } from '@affine/env/constant';
import type {
  AffineCloudWorkspace,
  AffinePublicWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import type { AffineOfficialWorkspace } from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { Button } from '@toeverything/components/button';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { toast } from '../../../utils';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import { TmpDisableAffineCloudModal } from '../tmp-disable-affine-cloud-modal';
import type { WorkspaceSettingDetailProps } from './index';
import * as style from './style.css';

export interface PublishPanelProps
  extends Omit<WorkspaceSettingDetailProps, 'workspaceId'> {
  workspace: AffineOfficialWorkspace;
}
export interface PublishPanelLocalProps
  extends Omit<WorkspaceSettingDetailProps, 'workspaceId'> {
  workspace: LocalWorkspace;
}
export interface PublishPanelAffineProps
  extends Omit<WorkspaceSettingDetailProps, 'workspaceId'> {
  workspace: AffineCloudWorkspace | AffinePublicWorkspace;
}

const PublishPanelAffine = (props: PublishPanelAffineProps) => {
  const { workspace } = props;
  const t = useAFFiNEI18N();
  // const toggleWorkspacePublish = useToggleWorkspacePublish(workspace);
  const isPublic = useMemo(() => {
    return workspace.flavour === WorkspaceFlavour.AFFINE_PUBLIC;
  }, [workspace]);
  const [origin, setOrigin] = useState('');
  const shareUrl = origin + '/public-workspace/' + workspace.id;

  useEffect(() => {
    setOrigin(
      typeof window !== 'undefined' && window.location.origin
        ? window.location.origin
        : ''
    );
  }, []);

  const copyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(shareUrl);
    toast(t['Copied link to clipboard']());
  }, [shareUrl, t]);

  return (
    <div style={{ display: 'none' }}>
      <SettingRow
        name={t['Publish']()}
        desc={isPublic ? t['Unpublished hint']() : t['Published hint']()}
        style={{
          marginBottom: isPublic ? '12px' : '25px',
        }}
      >
        <Switch
          checked={isPublic}
          // onChange={useCallback(value => {
          //   console.log('onChange', value);
          // }, [])}
        />
      </SettingRow>
      {isPublic ? (
        <FlexWrapper justifyContent="space-between" marginBottom={25}>
          <Input value={shareUrl} disabled />
          <Button
            onClick={copyUrl}
            style={{
              marginLeft: '20px',
            }}
          >
            {t['Copy']()}
          </Button>
        </FlexWrapper>
      ) : null}
    </div>
  );
};

interface FakePublishPanelAffineProps {
  workspace: AffineOfficialWorkspace;
}

const FakePublishPanelAffine = (_props: FakePublishPanelAffineProps) => {
  const t = useAFFiNEI18N();

  return (
    <Tooltip content={t['com.affine.settings.workspace.publish-tooltip']()}>
      <div className={style.fakeWrapper}>
        <SettingRow name={t['Publish']()} desc={t['Unpublished hint']()}>
          <Switch checked={false} />
        </SettingRow>
      </div>
    </Tooltip>
  );
};

const PublishPanelLocal = ({
  workspace,
  onTransferWorkspace,
}: PublishPanelLocalProps) => {
  const t = useAFFiNEI18N();
  const [name] = useBlockSuiteWorkspaceName(workspace.blockSuiteWorkspace);

  const [open, setOpen] = useState(false);

  return (
    <>
      <SettingRow
        name={t['Workspace saved locally']({ name })}
        desc={t['Enable cloud hint']()}
        spreadCol={false}
        style={{
          padding: '10px',
          background: 'var(--affine-background-secondary-color)',
        }}
      >
        <Button
          data-testid="publish-enable-affine-cloud-button"
          type="primary"
          onClick={() => {
            setOpen(true);
          }}
          style={{ marginTop: '12px' }}
        >
          {t['Enable AFFiNE Cloud']()}
        </Button>
      </SettingRow>
      <FakePublishPanelAffine workspace={workspace} />
      {runtimeConfig.enableCloud ? (
        <EnableAffineCloudModal
          open={open}
          onClose={() => {
            setOpen(false);
          }}
          onConfirm={() => {
            onTransferWorkspace(
              WorkspaceFlavour.LOCAL,
              WorkspaceFlavour.AFFINE_CLOUD,
              workspace
            );
            setOpen(false);
          }}
        />
      ) : (
        <TmpDisableAffineCloudModal
          open={open}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
};

export const PublishPanel = (props: PublishPanelProps) => {
  if (
    props.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD ||
    props.workspace.flavour === WorkspaceFlavour.AFFINE_PUBLIC
  ) {
    return <PublishPanelAffine {...props} workspace={props.workspace} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <PublishPanelLocal {...props} workspace={props.workspace} />;
  }
  throw new Unreachable();
};
