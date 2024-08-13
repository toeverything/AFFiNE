import { UserFeatureService } from '@affine/core/modules/cloud/services/user-feature';
import { useI18n } from '@affine/i18n';
import {
  AppearanceIcon,
  ExperimentIcon,
  InformationIcon,
  KeyboardIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import type { ReactElement, SVGProps } from 'react';
import { useEffect } from 'react';

import { AuthService, ServerConfigService } from '../../../../modules/cloud';
import type { GeneralSettingKey } from '../types';
import { AboutAffine } from './about';
import { AppearanceSettings } from './appearance';
import { BillingSettings } from './billing';
import { ExperimentalFeatures } from './experimental-features';
import { PaymentIcon, UpgradeIcon } from './icons';
import { AFFiNEPricingPlans } from './plans';
import { Shortcuts } from './shortcuts';

interface GeneralSettingListItem {
  key: GeneralSettingKey;
  title: string;
  icon: (props: SVGProps<SVGSVGElement>) => ReactElement;
  testId: string;
}

export type GeneralSettingList = GeneralSettingListItem[];

export const useGeneralSettingList = (): GeneralSettingList => {
  const t = useI18n();
  const { authService, serverConfigService, userFeatureService } = useServices({
    AuthService,
    ServerConfigService,
    UserFeatureService,
  });
  const status = useLiveData(authService.session.status$);
  const hasPaymentFeature = useLiveData(
    serverConfigService.serverConfig.features$.map(f => f?.payment)
  );

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  const settings: GeneralSettingListItem[] = [
    {
      key: 'appearance',
      title: t['com.affine.settings.appearance'](),
      icon: AppearanceIcon,
      testId: 'appearance-panel-trigger',
    },
    {
      key: 'shortcuts',
      title: t['com.affine.keyboardShortcuts.title'](),
      icon: KeyboardIcon,
      testId: 'shortcuts-panel-trigger',
    },
    {
      key: 'about',
      title: t['com.affine.aboutAFFiNE.title'](),
      icon: InformationIcon,
      testId: 'about-panel-trigger',
    },
  ];

  if (hasPaymentFeature) {
    settings.splice(3, 0, {
      key: 'plans',
      title: t['com.affine.payment.title'](),
      icon: UpgradeIcon,
      testId: 'plans-panel-trigger',
    });
    if (status === 'authenticated') {
      settings.splice(3, 0, {
        key: 'billing',
        title: t['com.affine.payment.billing-setting.title'](),
        icon: PaymentIcon,
        testId: 'billing-panel-trigger',
      });
    }
  }

  if (runtimeConfig.enableExperimentalFeature) {
    settings.push({
      key: 'experimental-features',
      title: t['com.affine.settings.workspace.experimental-features'](),
      icon: ExperimentIcon,
      testId: 'experimental-features-trigger',
    });
  }

  return settings;
};

interface GeneralSettingProps {
  generalKey: GeneralSettingKey;
}

export const GeneralSetting = ({ generalKey }: GeneralSettingProps) => {
  switch (generalKey) {
    case 'shortcuts':
      return <Shortcuts />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'about':
      return <AboutAffine />;
    case 'plans':
      return <AFFiNEPricingPlans />;
    case 'billing':
      return <BillingSettings />;
    case 'experimental-features':
      return <ExperimentalFeatures />;
    default:
      return null;
  }
};
