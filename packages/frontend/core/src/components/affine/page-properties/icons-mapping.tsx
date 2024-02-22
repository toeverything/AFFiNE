import { PagePropertyType } from '@affine/core/modules/workspace/properties/schema';
import * as icons from '@blocksuite/icons';
import type { SVGProps } from 'react';

type IconType = (props: SVGProps<SVGSVGElement>) => JSX.Element;

// todo: this breaks tree-shaking, and we should fix it (using dynamic imports?)
const IconsMapping = icons;
export type PagePropertyIcon = keyof typeof IconsMapping;

const excludedIcons: PagePropertyIcon[] = [
  'YoutubeDuotoneIcon',
  'LinearLogoIcon',
  'RedditDuotoneIcon',
  'Logo2Icon',
  'Logo3Icon',
  'Logo4Icon',
  'InstagramDuotoneIcon',
  'TelegramDuotoneIcon',
  'TextBackgroundDuotoneIcon',
];

export const iconNames = Object.keys(IconsMapping).filter(
  icon => !excludedIcons.includes(icon as PagePropertyIcon)
) as PagePropertyIcon[];

export const getDefaultIconName = (
  type: PagePropertyType
): PagePropertyIcon => {
  switch (type) {
    case 'text':
      return 'TextIcon';
    case 'tags':
      return 'TagIcon';
    case 'date':
      return 'DateTimeIcon';
    case 'progress':
      return 'ProgressIcon';
    case 'checkbox':
      return 'CheckBoxCheckLinearIcon';
    case 'number':
      return 'NumberIcon';
    default:
      return 'TextIcon';
  }
};

// fixme: this function may break if icons are imported twice
export const IconToIconName = (icon: IconType) => {
  const iconKey = Object.entries(IconsMapping).find(([_, candidate]) => {
    return candidate === icon;
  })?.[0];
  return iconKey;
};

export const getSafeIconName = (
  iconName: string,
  type?: PagePropertyType
): PagePropertyIcon => {
  return Object.hasOwn(IconsMapping, iconName)
    ? (iconName as PagePropertyIcon)
    : getDefaultIconName(type || PagePropertyType.Text);
};

export const nameToIcon = (
  iconName: string,
  type?: PagePropertyType
): IconType => {
  return IconsMapping[getSafeIconName(iconName, type)];
};
