import { Unreachable } from '@affine/env';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { FC } from 'react';

import type { AffineOfficialWorkspace } from '../../../shared';
import type { WorkspaceSettingDetailProps } from './index';

export type PublishPanelProps = WorkspaceSettingDetailProps & {
  workspace: AffineOfficialWorkspace;
};

const PublishPanelAffine: FC<PublishPanelProps> = () => {
  return <div>affine</div>;
};
const PublishPanelLocal: FC<PublishPanelProps> = () => {
  return <div>local</div>;
};
export const PublishPanel: FC<PublishPanelProps> = props => {
  if (props.workspace.flavour === WorkspaceFlavour.AFFINE) {
    return <PublishPanelAffine {...props} workspace={props.workspace} />;
  } else if (props.workspace.flavour === WorkspaceFlavour.LOCAL) {
    return <PublishPanelLocal {...props} workspace={props.workspace} />;
  }
  throw new Unreachable();
};
