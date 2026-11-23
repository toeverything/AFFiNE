import { MenuItem } from '@affine/component';
import type { OrderByParams } from '@affine/core/modules/collection-rules/types';
import { WorkspacePropertyService } from '@affine/core/modules/workspace-property';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { SortDownIcon, SortUpIcon } from '@blocksuite/icons/rc';
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
  const propertyList = useLiveData(workspacePropertyService.sortedProperties$);
  const explorerPropertyList = useMemo(() => {
    return generateExplorerPropertyList(propertyList);
  }, [propertyList]);

  return (
    <>
      {explorerPropertyList.map(property => (
        <OrderByListItem
          key={property.systemProperty?.type ?? property.workspaceProperty?.id}
          property={property}
          orderBy={orderBy}
          onChange={onChange}
        />
      ))}
    </>
  );
};

const OrderByListItem = ({
  property,
  orderBy,
  onChange,
}: {
  property: ReturnType<typeof generateExplorerPropertyList>[number];
  orderBy?: OrderByParams;
  onChange?: (next: OrderByParams) => void;
}) => {
  const t = useI18n();
  const { systemProperty, workspaceProperty } = property;

  const allowInOrderBy = systemProperty
    ? 'allowInOrderBy' in systemProperty && systemProperty.allowInOrderBy
    : workspaceProperty
      ? isSupportedWorkspacePropertyType(workspaceProperty.type) &&
        WorkspacePropertyTypes[workspaceProperty.type].allowInOrderBy
      : false;

  if (!allowInOrderBy) {
    return null;
  }

  const active =
    (systemProperty &&
      orderBy?.type === 'system' &&
      orderBy?.key === systemProperty.type) ||
    (workspaceProperty &&
      orderBy?.type === 'property' &&
      orderBy?.key === workspaceProperty.id);

  const value = systemProperty
    ? {
        type: 'system',
        key: systemProperty.type,
        desc: !active ? false : !orderBy.desc,
      }
    : workspaceProperty
      ? {
          type: 'property',
          key: workspaceProperty.id,
          desc: !active ? false : !orderBy.desc,
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
          control: 'orderBy',
          type: property.systemProperty?.type ?? 'custom-property',
        });
        if (value) {
          onChange?.(value);
        }
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
      {name}
    </MenuItem>
  );
};
