import type { ComponentType, SVGProps } from 'react';

import { ActivityIcon } from './icons/activity';
import { AnimalIcon } from './icons/animal';
import { FlagIcon } from './icons/flag';
import { FoodIcon } from './icons/food';
import { ObjectIcon } from './icons/object';
import { SmileIcon } from './icons/smile';
import { SymbolIcon } from './icons/symbol';
import { TravelIcon } from './icons/travel';

export type GroupName =
  | 'Smileys & People'
  | 'Animals & Nature'
  | 'Food & Drink'
  | 'Activity'
  | 'Travel & Places'
  | 'Objects'
  | 'Symbols'
  | 'Flags';
export const GROUPS: GroupName[] = [
  'Smileys & People',
  'Animals & Nature',
  'Food & Drink',
  'Activity',
  'Travel & Places',
  'Objects',
  'Symbols',
  'Flags',
];
export const GROUP_ICON_MAP: Record<
  GroupName,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  'Smileys & People': SmileIcon,
  'Animals & Nature': AnimalIcon,
  'Food & Drink': FoodIcon,
  Activity: ActivityIcon,
  'Travel & Places': TravelIcon,
  Objects: ObjectIcon,
  Symbols: SymbolIcon,
  Flags: FlagIcon,
};
