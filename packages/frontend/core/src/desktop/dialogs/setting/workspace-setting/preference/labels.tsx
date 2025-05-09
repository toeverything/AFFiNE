import { WorkspacePermissionService } from '@affine/core/modules/permissions';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useEffect, useMemo } from 'react';

import * as style from './style.css';

type WorkspaceStatus =
  | 'local'
  | 'syncCloud'
  | 'selfHosted'
  | 'joinedWorkspace'
  | 'availableOffline'
  | 'teamWorkspace'
  | 'publishedToWeb';

type LabelProps = {
  value: string;
  background: string;
};

type LabelMap = {
  [key in WorkspaceStatus]: LabelProps;
};
type labelConditionsProps = {
  condition: boolean;
  label: WorkspaceStatus;
};
const Label = ({ value, background }: LabelProps) => {
  return (
    <div>
      <div className={style.workspaceLabel} style={{ background: background }}>
        {value}
      </div>
    </div>
  );
};

const getConditions = (
  isOwner: boolean | null,
  flavour: string,
  isTeam: boolean | null
): labelConditionsProps[] => {
  return [
    { condition: !isOwner, label: 'joinedWorkspace' },
    { condition: flavour === 'local', label: 'local' },
    {
      condition: flavour === 'affine-cloud',
      label: 'syncCloud',
    },
    {
      condition: !!isTeam,
      label: 'teamWorkspace',
    },
    {
      condition: flavour !== 'affine-cloud' && flavour !== 'local',
      label: 'selfHosted',
    },
  ];
};

const getLabelMap = (t: ReturnType<typeof useI18n>): LabelMap => ({
  local: {
    value: t['com.affine.settings.workspace.state.local'](),
    background: cssVarV2('chip/label/orange'),
  },
  syncCloud: {
    value: t['com.affine.settings.workspace.state.sync-affine-cloud'](),
    background: cssVarV2('chip/label/blue'),
  },
  selfHosted: {
    value: t['com.affine.settings.workspace.state.self-hosted'](),
    background: cssVarV2('chip/label/purple'),
  },
  joinedWorkspace: {
    value: t['com.affine.settings.workspace.state.joined'](),
    background: cssVarV2('chip/label/yellow'),
  },
  availableOffline: {
    value: t['com.affine.settings.workspace.state.available-offline'](),
    background: cssVarV2('chip/label/green'),
  },
  publishedToWeb: {
    value: t['com.affine.settings.workspace.state.published'](),
    background: cssVarV2('chip/label/blue'),
  },
  teamWorkspace: {
    value: t['com.affine.settings.workspace.state.team'](),
    background: cssVarV2('chip/label/purple'),
  },
});

export const LabelsPanel = () => {
  const workspace = useService(WorkspaceService).workspace;
  const permissionService = useService(WorkspacePermissionService);
  const isOwner = useLiveData(permissionService.permission.isOwner$);
  const isTeam = useLiveData(permissionService.permission.isTeam$);
  const t = useI18n();

  useEffect(() => {
    permissionService.permission.revalidate();
  }, [permissionService]);

  const labelMap = useMemo(() => getLabelMap(t), [t]);

  const labelConditions = useMemo(
    () => getConditions(isOwner, workspace.flavour, isTeam),
    [isOwner, isTeam, workspace.flavour]
  );

  return (
    <div className={style.labelWrapper}>
      {labelConditions.map(
        ({ condition, label }) =>
          condition && (
            <Label
              key={label}
              value={labelMap[label].value}
              background={labelMap[label].background}
            />
          )
      )}
    </div>
  );
};
