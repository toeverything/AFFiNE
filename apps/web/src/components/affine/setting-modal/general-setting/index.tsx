import {
  AppearanceIcon,
  InformationIcon,
  KeyboardIcon,
} from '@blocksuite/icons';
import type { FC, SVGProps } from 'react';

import { AboutAffine } from './about';
import { AppearanceSettings } from './appearance';
import { Shortcuts } from './shortcuts';

export type GeneralSettingKeys = 'shortcuts' | 'appearance' | 'about';

export type GeneralSettingList = {
  key: GeneralSettingKeys;
  title: string;
  icon: FC<SVGProps<SVGSVGElement>>;
}[];

export const generalSettingList: GeneralSettingList = [
  {
    key: 'appearance',
    title: 'Appearance',
    icon: AppearanceIcon,
  },
  {
    key: 'shortcuts',
    title: 'Keyboard Shortcuts',
    icon: KeyboardIcon,
  },
  {
    key: 'about',
    title: 'About AFFiNE',
    icon: InformationIcon,
  },
];

export const GeneralSetting = ({
  generalKey,
}: {
  generalKey: GeneralSettingKeys;
}) => {
  switch (generalKey) {
    case 'shortcuts':
      return <Shortcuts />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'about':
      return <AboutAffine />;
    default:
      return null;
  }
};
