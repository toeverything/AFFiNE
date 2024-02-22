import type { PagePropertyType } from '@affine/core/modules/workspace/properties/schema';
import * as icons from '@blocksuite/icons';
import type { SVGProps } from 'react';

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;

// todo: this breaks tree-shaking, and we should fix it (using dynamic imports?)
const IconsMapping = {
  text: icons.TextIcon,
  tag: icons.TagIcon,
  dateTime: icons.DateTimeIcon,
  progress: icons.ProgressIcon,
  checkbox: icons.CheckBoxCheckLinearIcon,
  number: icons.NumberIcon,
  // todo: add more icons
} satisfies Record<string, IconType>;

export type PagePropertyIcon = keyof typeof IconsMapping;

export const getDefaultIconName = (
  type: PagePropertyType
): PagePropertyIcon => {
  switch (type) {
    case 'text':
      return 'text';
    case 'tags':
      return 'tag';
    case 'date':
      return 'dateTime';
    case 'progress':
      return 'progress';
    case 'checkbox':
      return 'checkbox';
    case 'number':
      return 'number';
    default:
      return 'text';
  }
};

// fixme: this function may break if icons are imported twice
export const IconToIconName = (icon: IconType) => {
  const iconKey = Object.entries(IconsMapping).find(([_, candidate]) => {
    return candidate === icon;
  })?.[0];
  return iconKey;
};

export const nameToIcon = (
  iconName: string,
  type: PagePropertyType
): IconType => {
  return (
    IconsMapping[iconName as keyof typeof IconsMapping] ??
    getDefaultIconName(type)
  );
};
