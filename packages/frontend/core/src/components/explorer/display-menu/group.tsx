import { Divider, MenuItem } from '@affine/component';
import type { GroupByParams } from '@affine/core/modules/collection-rules/types';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useMemo } from 'react';

import { WorkspacePropertyName } from '../../properties';
import {
  isSupportedSystemPropertyType,
  SystemPropertyTypes,
} from '../../system-property-types';
import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import { generateExplorerPropertyList } from '../properties';

const PropertyGroupByName = ({ groupBy }: { groupBy: GroupByParams }) => {
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(groupBy.key)
  );

  return propertyInfo ? (
    <WorkspacePropertyName propertyInfo={propertyInfo} />
  ) : null;
};

export const GroupByName = ({ groupBy }: { groupBy: GroupByParams }) => {
  const t = useI18n();
  if (groupBy.type === 'property') {
    return <PropertyGroupByName groupBy={groupBy} />;
  }
  if (groupBy.type === 'system') {
    const type = isSupportedSystemPropertyType(groupBy.key)
      ? SystemPropertyTypes[groupBy.key]
      : null;
    return type ? t.t(type.name) : null;
  }
  return null;
};

export const GroupByList = ({
  groupBy,
  onChange,
}: {
  groupBy?: GroupByParams;
  onChange?: (next: GroupByParams | undefined) => void;
}) => {
  const t = useI18n();
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyList = useLiveData(workspacePropertyService.sortedProperties$);
  const explorerPropertyList = useMemo(() => {
    return generateExplorerPropertyList(propertyList);
  }, [propertyList]);

  return (
    <>
      {explorerPropertyList.map(property => (
        <GroupByListItem
          key={property.systemProperty?.type ?? property.workspaceProperty?.id}
          property={property}
          groupBy={groupBy}
          onChange={onChange}
        />
      ))}
      <Divider size="thinner" style={{ margin: '4px 0' }} />
      <MenuItem onClick={() => onChange?.(undefined)}>
        {t['com.affine.explorer.display-menu.grouping.remove']()}
      </MenuItem>
    </>
  );
};

const GroupByListItem = ({
  property,
  groupBy,
  onChange,
}: {
  property: ReturnType<typeof generateExplorerPropertyList>[number];
  groupBy?: GroupByParams;
  onChange?: (next: GroupByParams) => void;
}) => {
  const t = useI18n();
  const { systemProperty, workspaceProperty } = property;

  const allowInGroupBy = systemProperty
    ? 'allowInGroupBy' in systemProperty && systemProperty.allowInGroupBy
    : workspaceProperty
      ? isSupportedWorkspacePropertyType(workspaceProperty.type) &&
        WorkspacePropertyTypes[workspaceProperty.type].allowInGroupBy
      : false;

  if (!allowInGroupBy) {
    return null;
  }

  const active =
    (systemProperty &&
      groupBy?.type === 'system' &&
      groupBy?.key === systemProperty.type) ||
    (workspaceProperty &&
      groupBy?.type === 'property' &&
      groupBy?.key === workspaceProperty.id);

  const value = systemProperty
    ? {
        type: 'system',
        key: systemProperty.type,
      }
    : workspaceProperty
      ? {
          type: 'property',
          key: workspaceProperty.id,
        }
      : null;

  const name = workspaceProperty ? (
    <WorkspacePropertyName propertyInfo={workspaceProperty} />
  ) : systemProperty ? (
    t.t(systemProperty.name)
  ) : null;

  return (
    <MenuItem
      onClick={e => {
        e.preventDefault();
        track.allDocs.header.displayMenu.editDisplayMenu({
          control: 'groupBy',
          type: property.systemProperty?.type ?? 'custom-property',
        });
        if (value) {
          onChange?.(value);
        }
      }}
      suffixIcon={
        active ? (
          <DoneIcon style={{ color: cssVarV2('icon/activated') }} />
        ) : null
      }
    >
      {name}
    </MenuItem>
  );
};
