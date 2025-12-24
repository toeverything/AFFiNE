import type { DocCustomPropertyInfo } from '@affine/core/modules/db';
import * as icons from '@blocksuite/icons/rc';
import type { SVGProps } from 'react';

import {
  isSupportedWorkspacePropertyType,
  WorkspacePropertyTypes,
} from '../../workspace-property-types';
import {
  type WorkspacePropertyIconName,
  WorkspacePropertyIconNames,
} from './constant';

// assume all exports in icons are icon Components
type LibIconComponentName = keyof typeof icons;

export const iconNameToComponent = (name: WorkspacePropertyIconName) => {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const IconComponent =
    icons[`${capitalize(name)}Icon` as LibIconComponentName];
  if (!IconComponent) {
    throw new Error(`Icon ${name} not found`);
  }
  return IconComponent;
};

export const WorkspacePropertyIcon = ({
  propertyInfo,
  ...props
}: {
  propertyInfo: DocCustomPropertyInfo;
} & SVGProps<SVGSVGElement>) => {
  const Icon =
    propertyInfo.icon &&
    WorkspacePropertyIconNames.includes(
      propertyInfo.icon as WorkspacePropertyIconName
    )
      ? iconNameToComponent(propertyInfo.icon as WorkspacePropertyIconName)
      : isSupportedWorkspacePropertyType(propertyInfo.type)
        ? WorkspacePropertyTypes[propertyInfo.type].icon
        : WorkspacePropertyTypes.text.icon;

  return <Icon {...props} />;
};
