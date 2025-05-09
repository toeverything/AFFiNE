import { MenuItem } from '@affine/component';
import type { GroupByParams } from '@affine/core/modules/collection-rules/types';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import { DoneIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';

import { WorkspacePropertyName } from '../../properties';
import {
  isSupportedSystemPropertyType,
  SystemPropertyTypes,
} from '../../system-property-types';
import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';

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
  onChange?: (next: GroupByParams) => void;
}) => {
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyList = useLiveData(workspacePropertyService.properties$);

  return (
    <>
      {propertyList.map(v => {
        const allowInGroupBy = isSupportedWorkspacePropertyType(v.type)
          ? WorkspacePropertyTypes[v.type].allowInGroupBy
          : false;
        if (!allowInGroupBy) {
          return null;
        }
        return (
          <MenuItem
            key={v.id}
            onClick={e => {
              e.preventDefault();
              onChange?.({
                type: 'property',
                key: v.id,
              });
            }}
            suffixIcon={
              groupBy?.type === 'property' && groupBy?.key === v.id ? (
                <DoneIcon style={{ color: cssVarV2('icon/activated') }} />
              ) : null
            }
          >
            <WorkspacePropertyName propertyInfo={v} />
          </MenuItem>
        );
      })}
    </>
  );
};
