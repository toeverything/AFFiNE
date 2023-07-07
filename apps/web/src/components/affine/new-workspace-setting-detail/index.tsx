import {
  SettingHeader,
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import type {
  WorkspaceFlavour,
  WorkspaceRegistry,
} from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { rootWorkspacesMetadataAtom } from '@affine/workspace/atom';
import { useStaticWorkspace } from '@affine/workspace/utils';
import { assertExists } from '@blocksuite/global/utils';
import { useBlockSuiteWorkspaceName } from '@toeverything/hooks/use-block-suite-workspace-name';
import { useAtomValue } from 'jotai/index';
import type { FC } from 'react';
import { useMemo } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import { DeleteLeaveWorkspace } from './delete-leave-workspace';
import { ExportPanel } from './export';
import { ProfilePanel } from './profile';
import { PublishPanel } from './publish';
import { StoragePanel } from './storage';

export type WorkspaceSettingDetailProps = {
  workspaceId: string;
  onDeleteWorkspace: (id: string) => Promise<void>;
  onTransferWorkspace: <
    From extends WorkspaceFlavour,
    To extends WorkspaceFlavour,
  >(
    from: From,
    to: To,
    workspace: WorkspaceRegistry[From]
  ) => void;
};

export const WorkspaceSettingDetail: FC<WorkspaceSettingDetailProps> = ({
  workspaceId,
  onDeleteWorkspace,
  ...props
}) => {
  const t = useAFFiNEI18N();
  const blockSuiteWorkspace = useStaticWorkspace(workspaceId);
  const [name] = useBlockSuiteWorkspaceName(blockSuiteWorkspace);
  const metadata = useAtomValue(rootWorkspacesMetadataAtom);
  const flavour = useMemo(
    () => metadata.find(({ id }) => id === workspaceId)?.flavour,
    [metadata, workspaceId]
  );
  assertExists(flavour);
  const workspace = useMemo(
    () =>
      ({
        id: workspaceId,
        flavour,
        blockSuiteWorkspace,
      }) satisfies AffineOfficialWorkspace,
    [blockSuiteWorkspace, flavour, workspaceId]
  );

  return (
    <>
      <SettingHeader
        title={t[`Workspace Settings with name`]({ name })}
        subtitle={t['You can customize your workspace here.']()}
      />
      <SettingWrapper title={t['Info']()}>
        <SettingRow
          name={t['Workspace Profile']()}
          desc={t[
            'Only an owner can edit the the Workspace avatar and name.Changes will be shown for everyone.'
          ]()}
          spreadCol={false}
        >
          <ProfilePanel workspace={workspace} />
        </SettingRow>
      </SettingWrapper>
      <SettingWrapper title={t['AFFiNE Cloud']()}>
        <PublishPanel
          workspace={workspace}
          onDeleteWorkspace={onDeleteWorkspace}
          {...props}
        />
      </SettingWrapper>
      {environment.isDesktop ? (
        <SettingWrapper title={t['Storage and Export']()}>
          <StoragePanel workspace={workspace} />
          <ExportPanel workspace={workspace} />
        </SettingWrapper>
      ) : null}

      <SettingWrapper>
        <DeleteLeaveWorkspace
          workspace={workspace}
          onDeleteWorkspace={onDeleteWorkspace}
        />
      </SettingWrapper>
    </>
  );
};
