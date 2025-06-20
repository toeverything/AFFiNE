import { UserFeatureService } from '@affine/core/modules/cloud/services/user-feature';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import { MeetingSettingsService } from '@affine/core/modules/media/services/meeting-settings';
import { useI18n } from '@affine/i18n';
import {
  AppearanceIcon,
  ExperimentIcon,
  FolderIcon,
  InformationIcon,
  KeyboardIcon,
  MeetingIcon,
  NotificationIcon,
  PenIcon,
} from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { AuthService, ServerService } from '../../../../modules/cloud';
import type { SettingSidebarItem, SettingState } from '../types';
import { AboutAffine } from './about';
import { AppearanceSettings } from './appearance';
import { BackupSettingPanel } from './backup';
import { BillingSettings } from './billing';
import { EditorSettings } from './editor';
import { ExperimentalFeatures } from './experimental-features';
import { PaymentIcon, UpgradeIcon } from './icons';
import { MeetingsSettings } from './meetings';
import { NotificationSettings } from './notifications';
import { AFFiNEPricingPlans } from './plans';
import { Shortcuts } from './shortcuts';

export type GeneralSettingList = SettingSidebarItem[];

export const useGeneralSettingList = (): GeneralSettingList => {
  const t = useI18n();
  const {
    authService,
    serverService,
    userFeatureService,
    featureFlagService,
    meetingSettingsService,
  } = useServices({
    AuthService,
    ServerService,
    UserFeatureService,
    FeatureFlagService,
    MeetingSettingsService,
  });
  const status = useLiveData(authService.session.status$);
  const loggedIn = status === 'authenticated';
  const hasPaymentFeature = useLiveData(
    serverService.server.features$.map(f => f?.payment)
  );
  const enableEditorSettings = useLiveData(
    featureFlagService.flags.enable_editor_settings.$
  );

  useEffect(() => {
    userFeatureService.userFeature.revalidate();
  }, [userFeatureService]);

  const meetingSettings = useLiveData(meetingSettingsService.settings$);

  return useMemo(() => {
    const settings: GeneralSettingList = [
      {
        key: 'appearance',
        title: t['com.affine.settings.appearance'](),
        icon: <AppearanceIcon />,
        testId: 'appearance-panel-trigger',
      },
      {
        key: 'shortcuts',
        title: t['com.affine.keyboardShortcuts.title'](),
        icon: <KeyboardIcon />,
        testId: 'shortcuts-panel-trigger',
      },
    ];
    if (loggedIn) {
      settings.push({
        key: 'notifications',
        title: t['com.affine.setting.notifications'](),
        icon: <NotificationIcon />,
        testId: 'notifications-panel-trigger',
      });
    }
    if (enableEditorSettings) {
      // add editor settings to second position
      settings.splice(1, 0, {
        key: 'editor',
        title: t['com.affine.settings.editorSettings'](),
        icon: <PenIcon />,
        testId: 'editor-panel-trigger',
      });
    }

    if (
      (environment.isMacOs || environment.isWindows) &&
      BUILD_CONFIG.isElectron
    ) {
      settings.push({
        key: 'meetings',
        title: t['com.affine.settings.meetings'](),
        icon: <MeetingIcon />,
        testId: 'meetings-panel-trigger',
        beta: !meetingSettings?.enabled,
      });
    }

    if (hasPaymentFeature) {
      settings.splice(4, 0, {
        key: 'plans',
        title: t['com.affine.payment.title'](),
        icon: <UpgradeIcon />,
        testId: 'plans-panel-trigger',
      });
      if (loggedIn) {
        settings.splice(4, 0, {
          key: 'billing',
          title: t['com.affine.payment.billing-setting.title'](),
          icon: <PaymentIcon />,
          testId: 'billing-panel-trigger',
        });
      }
    }

    if (BUILD_CONFIG.isElectron) {
      settings.push({
        key: 'backup',
        title: t['com.affine.settings.workspace.backup'](),
        icon: <FolderIcon />,
        testId: 'backup-panel-trigger',
      });
    }

    settings.push(
      {
        key: 'experimental-features',
        title: t['com.affine.settings.workspace.experimental-features'](),
        icon: <ExperimentIcon />,
        testId: 'experimental-features-trigger',
      },
      {
        key: 'about',
        title: t['com.affine.aboutAFFiNE.title'](),
        icon: <InformationIcon />,
        testId: 'about-panel-trigger',
      }
    );
    return settings;
  }, [
    t,
    loggedIn,
    enableEditorSettings,
    meetingSettings?.enabled,
    hasPaymentFeature,
  ]);
};

interface GeneralSettingProps {
  activeTab: SettingTab;
  onChangeSettingState: (settingState: SettingState) => void;
}

export const GeneralSetting = ({
  activeTab,
  onChangeSettingState,
}: GeneralSettingProps) => {
  switch (activeTab) {
    case 'shortcuts':
      return <Shortcuts />;
    case 'notifications':
      return <NotificationSettings />;
    case 'editor':
      return <EditorSettings />;
    case 'appearance':
      return <AppearanceSettings />;
    case 'meetings':
      return <MeetingsSettings />;
    case 'about':
      return <AboutAffine />;
    case 'plans':
      return <AFFiNEPricingPlans />;
    case 'billing':
      return <BillingSettings onChangeSettingState={onChangeSettingState} />;
    case 'experimental-features':
      return <ExperimentalFeatures />;
    case 'backup':
      return <BackupSettingPanel />;
    default:
      return null;
  }
};
