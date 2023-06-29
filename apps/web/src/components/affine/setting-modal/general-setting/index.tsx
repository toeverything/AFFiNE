import { useAFFiNEI18N } from '@affine/i18n/hooks';
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

export const useGeneralSettingList = (): GeneralSettingList => {
  const t = useAFFiNEI18N();
  return [
    {
      key: 'appearance',
      title: t['com.affine.settings.appearance'](),
      icon: AppearanceIcon,
    },
    {
      key: 'shortcuts',
      title: t['Keyboard Shortcuts'](),
      icon: KeyboardIcon,
    },
    {
      key: 'about',
      title: t['About AFFiNE'](),
      icon: InformationIcon,
    },
  ];
};

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
