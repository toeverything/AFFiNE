import { ShareMenu } from '@affine/component/share-menu';
import type { AffineWorkspace, LocalWorkspace } from '@affine/workspace/type';
import { WorkspaceFlavour } from '@affine/workspace/type';
import type { Page } from '@blocksuite/store';
import type React from 'react';
import { useCallback } from 'react';

import { useToggleWorkspacePublish } from '../../../../hooks/affine/use-toggle-workspace-publish';
import type { BaseHeaderProps } from '../header';

const AffineHeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  const toggleWorkspacePublish = useToggleWorkspacePublish(
    props.workspace as AffineWorkspace
  );
  return (
    <ShareMenu
      workspace={props.workspace as AffineWorkspace}
      currentPage={props.currentPage as Page}
      onEnableAffineCloud={useCallback(async () => {}, [])}
      onOpenWorkspaceSettings={useCallback(async () => {}, [])}
      togglePagePublic={useCallback(async () => {}, [])}
      toggleWorkspacePublish={useCallback(async () => {}, [])}
    />
  );
};

const LocalHeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  return (
    <ShareMenu
      workspace={props.workspace as LocalWorkspace}
      currentPage={props.currentPage as Page}
      onEnableAffineCloud={useCallback(async () => {}, [])}
      onOpenWorkspaceSettings={useCallback(async () => {}, [])}
      togglePagePublic={useCallback(async () => {}, [])}
      toggleWorkspacePublish={useCallback(async () => {}, [])}
    />
  );
};

export const HeaderShareMenu: React.FC<BaseHeaderProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return <AffineHeaderShareMenu {...props} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <LocalHeaderShareMenu {...props} />;
  }
  throw new Error('unreachable');
};
