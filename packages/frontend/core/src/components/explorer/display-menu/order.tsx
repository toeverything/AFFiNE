import { MenuItem } from '@affine/component';
import type { OrderByParams } from '@affine/core/modules/collection-rules/types';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import { SortDownIcon, SortUpIcon } from '@blocksuite/icons/rc';
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

const PropertyOrderByName = ({ orderBy }: { orderBy: OrderByParams }) => {
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyInfo = useLiveData(
    workspacePropertyService.propertyInfo$(orderBy.key)
  );

  return propertyInfo ? (
    <WorkspacePropertyName propertyInfo={propertyInfo} />
  ) : null;
};

export const OrderByName = ({ orderBy }: { orderBy: OrderByParams }) => {
  const t = useI18n();
  if (orderBy.type === 'property') {
    return <PropertyOrderByName orderBy={orderBy} />;
  }
  if (orderBy.type === 'system') {
    const type = isSupportedSystemPropertyType(orderBy.key)
      ? SystemPropertyTypes[orderBy.key]
      : null;
    return type ? t.t(type.name) : null;
  }
  return null;
};

export const OrderByList = ({
  orderBy,
  onChange,
}: {
  orderBy?: OrderByParams;
  onChange?: (next: OrderByParams) => void;
}) => {
  const workspacePropertyService = useService(WorkspacePropertyService);
  const propertyList = useLiveData(workspacePropertyService.properties$);

  return (
    <>
      {propertyList.map(v => {
        const allowInOrderBy = isSupportedWorkspacePropertyType(v.type)
          ? WorkspacePropertyTypes[v.type].allowInOrderBy
          : false;
        const active = orderBy?.type === 'property' && orderBy?.key === v.id;
        if (!allowInOrderBy) {
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
                desc: !active ? false : !orderBy.desc,
              });
            }}
            suffixIcon={
              active ? (
                !orderBy.desc ? (
                  <SortUpIcon style={{ color: cssVarV2('icon/activated') }} />
                ) : (
                  <SortDownIcon style={{ color: cssVarV2('icon/activated') }} />
                )
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
