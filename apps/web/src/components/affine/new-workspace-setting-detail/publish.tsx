import { Button, FlexWrapper, Switch } from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { Unreachable } from '@affine/env/constant';
import type {
  AffineCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import type { FC } from 'react';
import { useCallback, useState } from 'react';

import { useIsPublicCloudWorkspace } from '../../../hooks/affine/use-is-public-cloud-workspace';
import { useShareLink } from '../../../hooks/affine/use-share-link';
import { useToggleCloudPublic } from '../../../hooks/affine/use-toggle-cloud-public';
import type { AffineOfficialWorkspace } from '../../../shared';
import { toast } from '../../../utils';
import { EnableAffineCloudModal } from '../enable-affine-cloud-modal';
import { TmpDisableAffineCloudModal } from '../tmp-disable-affine-cloud-modal';
import type { WorkspaceSettingDetailProps } from './index';
import * as style from './style.css';

export type PublishPanelProps = WorkspaceSettingDetailProps & {
  workspace: AffineOfficialWorkspace;
};
export type PublishPanelLocalProps = WorkspaceSettingDetailProps & {
  workspace: LocalWorkspace;
};
export type PublishPanelAffineProps = WorkspaceSettingDetailProps & {
  workspace: AffineCloudWorkspace;
};

const PublishPanelAffine: FC<PublishPanelAffineProps> = props => {
  const { workspace } = props;
  const t = useAFFiNEI18N();
  const isPublic = useIsPublicCloudWorkspace(workspace.id);
  const toggleWorkspacePublic = useToggleCloudPublic(workspace.id);

  const shareLink = useShareLink(workspace.id);

  const copyUrl = useCallback(async () => {
    await navigator.clipboard.writeText(shareLink);
    toast(t['Copied link to clipboard']());
  }, [shareLink, t]);
  return (
    <>
      <SettingRow
        name={t['Publish']()}
        desc={isPublic ? t['Unpublished hint']() : t['Published hint']()}
      >
        <Switch
          checked={isPublic}
          onChange={checked => toggleWorkspacePublic(checked)}
        />
      </SettingRow>
      <FlexWrapper justifyContent="space-between">
        <Button
          className={style.urlButton}
          size="middle"
          onClick={useCallback(() => {
            window.open(shareLink, '_blank');
          }, [shareLink])}
          title={shareLink}
        >
          {shareLink}
        </Button>
        <Button size="middle" onClick={copyUrl}>
          {t['Copy']()}
        </Button>
      </FlexWrapper>
    </>
  );
};

const FakePublishPanelAffine: FC<{
  workspace: AffineOfficialWorkspace;
}> = ({ workspace }) => {
  const t = useAFFiNEI18N();
  const shareLink = useShareLink(workspace.id);
  return (
    <div className={style.fakeWrapper}>
      <SettingRow name={t['Publish']()} desc={t['Unpublished hint']()}>
        <Switch checked={false} />
      </SettingRow>
      <FlexWrapper justifyContent="space-between">
        <Button className={style.urlButton} size="middle" title={shareLink}>
          {shareLink}
        </Button>
        <Button size="middle">{t['Copy']()}</Button>
      </FlexWrapper>
    </div>
  );
};
const PublishPanelLocal: FC<PublishPanelLocalProps> = ({
  workspace,
  onTransferWorkspace,
}) => {
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

export const PublishPanel: FC<PublishPanelProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.AFFINE_CLOUD) {
    return <PublishPanelAffine {...props} workspace={props.workspace} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <PublishPanelLocal {...props} workspace={props.workspace} />;
  }
  throw new Unreachable();
};
