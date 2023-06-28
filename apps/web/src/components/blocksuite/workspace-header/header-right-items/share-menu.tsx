import { ShareMenu } from '@affine/component/share-menu';
import { Unreachable } from '@affine/env/constant';
import type {
  AffineLegacyCloudWorkspace,
  LocalWorkspace,
} from '@affine/env/workspace';
import { WorkspaceFlavour, WorkspaceSubPath } from '@affine/env/workspace';
import type { Page } from '@blocksuite/store';
import { assertEquals } from '@blocksuite/store';
import { useRouter } from 'next/router';
import type React from 'react';
import { useCallback, useState } from 'react';

import { useToggleWorkspacePublish } from '../../../../hooks/affine/use-toggle-workspace-publish';
import { useOnTransformWorkspace } from '../../../../hooks/root/use-on-transform-workspace';
import { useRouterHelper } from '../../../../hooks/use-router-helper';
import { TransformWorkspaceToAffineModal } from '../../../affine/transform-workspace-to-affine-modal';
import type { BaseHeaderProps } from '../header';

const AffineHeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  // todo: these hooks should be moved to the top level
  const togglePublish = useToggleWorkspacePublish(
    props.workspace as AffineLegacyCloudWorkspace
  );
  const helper = useRouterHelper(useRouter());
  return (
    <ShareMenu
      workspace={props.workspace as AffineLegacyCloudWorkspace}
      currentPage={props.currentPage as Page}
      onEnableAffineCloud={useCallback(async () => {
        throw new Unreachable(
          'Affine workspace should not enable affine cloud again'
        );
      }, [])}
      onOpenWorkspaceSettings={useCallback(
        async workspace => {
          return helper.jumpToSubPath(workspace.id, WorkspaceSubPath.SETTING);
        },
        [helper]
      )}
      togglePagePublic={useCallback(async (page, isPublic) => {
        page.workspace.setPageMeta(page.id, { isPublic });
      }, [])}
      toggleWorkspacePublish={useCallback(
        async (workspace, publish) => {
          assertEquals(workspace.flavour, WorkspaceFlavour.AFFINE);
          assertEquals(workspace.id, props.workspace.id);
          await togglePublish(publish);
        },
        [props.workspace.id, togglePublish]
      )}
    />
  );
};

const LocalHeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  // todo: these hooks should be moved to the top level
  const onTransformWorkspace = useOnTransformWorkspace();
  const helper = useRouterHelper(useRouter());
  const [open, setOpen] = useState(false);
  return (
    <>
      <ShareMenu
        workspace={props.workspace as LocalWorkspace}
        currentPage={props.currentPage as Page}
        onEnableAffineCloud={useCallback(
          async workspace => {
            assertEquals(workspace.flavour, WorkspaceFlavour.LOCAL);
            assertEquals(workspace.id, props.workspace.id);
            setOpen(true);
          },
          [props.workspace.id]
        )}
        onOpenWorkspaceSettings={useCallback(
          async workspace => {
            await helper.jumpToSubPath(workspace.id, WorkspaceSubPath.SETTING);
          },
          [helper]
        )}
        togglePagePublic={useCallback(async () => {
          // local workspace should not have public page
          throw new Error('unreachable');
        }, [])}
        toggleWorkspacePublish={useCallback(
          async workspace => {
            assertEquals(workspace.flavour, WorkspaceFlavour.LOCAL);
            assertEquals(workspace.id, props.workspace.id);
            await helper.jumpToSubPath(workspace.id, WorkspaceSubPath.SETTING);
          },
          [helper, props.workspace.id]
        )}
      />
      <TransformWorkspaceToAffineModal
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        onConform={async () => {
          await onTransformWorkspace(
            WorkspaceFlavour.LOCAL,
            WorkspaceFlavour.AFFINE,
            props.workspace as LocalWorkspace
          );
          setOpen(false);
        }}
      />
    </>
  );
};

export const HeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  if (!runtimeConfig.enableLegacyCloud) {
    return null;
  }
  if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return <AffineHeaderShareMenu {...props} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalHeaderShareMenu {...props} />;
  }
  throw new Error('unreachable');
};
