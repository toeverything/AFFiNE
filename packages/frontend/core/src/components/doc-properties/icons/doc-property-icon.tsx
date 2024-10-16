import * as icons from '@blocksuite/icons/rc';
import type { DocCustomPropertyInfo } from '@toeverything/infra';
import type { SVGProps } from 'react';

import {
  DocPropertyTypes,
  isSupportedDocPropertyType,
} from '../types/constant';
import { type DocPropertyIconName, DocPropertyIconNames } from './constant';

// assume all exports in icons are icon Components
type LibIconComponentName = keyof typeof icons;

export const iconNameToComponent = (name: DocPropertyIconName) => {
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const IconComponent =
    icons[`${capitalize(name)}Icon` as LibIconComponentName];
  if (!IconComponent) {
    throw new Error(`Icon ${name} not found`);
  }
  return IconComponent;
};

export const DocPropertyIcon = ({
  propertyInfo,
  ...props
}: {
  propertyInfo: DocCustomPropertyInfo;
} & SVGProps<SVGSVGElement>) => {
  const Icon =
    propertyInfo.icon &&
    DocPropertyIconNames.includes(propertyInfo.icon as DocPropertyIconName)
      ? iconNameToComponent(propertyInfo.icon as DocPropertyIconName)
      : isSupportedDocPropertyType(propertyInfo.type)
        ? DocPropertyTypes[propertyInfo.type].icon
        : DocPropertyTypes.text.icon;

  return <Icon {...props} />;
};
