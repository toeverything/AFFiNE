import { Button, Checkbox, Loading, Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { Suspense, useCallback, useState } from 'react';

import { ExperimentalFeatureArts } from './arts';
import * as styles from './index.css';

const ExperimentalFeaturesPrompt = ({
  onConfirm,
}: {
  onConfirm: () => void;
}) => {
  const t = useAFFiNEI18N();
  const [checked, setChecked] = useState(false);

  const onChange: (
    event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => void = useCallback((_, checked) => {
    setChecked(checked);
  }, []);

  return (
    <div className={styles.promptRoot} data-testid="experimental-prompt">
      <div className={styles.promptTitle}>
        {t[
          'com.affine.settings.workspace.experimental-features.prompt-header'
        ]()}
      </div>
      <div className={styles.promptArt}>
        <ExperimentalFeatureArts />
      </div>
      <div className={styles.promptWarning}>
        <div className={styles.promptWarningTitle}>
          {t[
            'com.affine.settings.workspace.experimental-features.prompt-warning-title'
          ]()}
        </div>
        {t[
          'com.affine.settings.workspace.experimental-features.prompt-warning'
        ]()}
      </div>

      <div className={styles.spacer} />

      <label className={styles.promptDisclaimer}>
        <Checkbox
          checked={checked}
          onChange={onChange}
          data-testid="experimental-prompt-disclaimer"
        />
        {t[
          'com.affine.settings.workspace.experimental-features.prompt-disclaimer'
        ]()}
      </label>

      <div className={styles.promptDisclaimerConfirm}>
        <Button
          disabled={!checked}
          onClick={onConfirm}
          type="primary"
          data-testid="experimental-confirm-button"
        >
          {t[
            'com.affine.settings.workspace.experimental-features.get-started'
          ]()}
        </Button>
      </div>
    </div>
  );
};

const ExperimentalFeaturesItem = ({
  title,
  isMutating,
  checked,
  onChange,
}: {
  title: React.ReactNode;
  isMutating?: boolean;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => {
  return (
    <div className={styles.switchRow}>
      {title}
      <Switch
        checked={checked}
        onChange={onChange}
        className={isMutating ? styles.switchDisabled : ''}
      />
    </div>
  );
};

const SplitViewSettingRow = () => {
  const { appSettings, updateSettings } = useAppSettingHelper();

  const onToggle = useCallback(
    (checked: boolean) => {
      updateSettings('enableMultiView', checked);
    },
    [updateSettings]
  );

  if (!environment.isDesktop) {
    return null; // only enable on desktop
  }

  return (
    <ExperimentalFeaturesItem
      title="Split View"
      checked={appSettings.enableMultiView}
      onChange={onToggle}
    />
  );
};

// feature flag -> display name
const blocksuiteFeatureFlags: Partial<Record<keyof BlockSuiteFlags, string>> = {
  enable_expand_database_block: 'Enable Expand Database Block',
  enable_database_statistics: 'Enable Database Block Statistics',
  enable_block_query: 'Enable Todo Block Query',
  enable_edgeless_text: 'Enable New Edgeless Text',
};

const BlocksuiteFeatureFlagSettings = () => {
  const { appSettings, updateSettings } = useAppSettingHelper();
  const toggleSetting = useCallback(
    (flag: keyof BlockSuiteFlags, checked: boolean) => {
      updateSettings('editorFlags', {
        ...appSettings.editorFlags,
        [flag]: checked,
      });
    },
    [appSettings.editorFlags, updateSettings]
  );

  type EditorFlag = keyof typeof appSettings.editorFlags;

  return (
    <>
      {Object.entries(blocksuiteFeatureFlags).map(([flag, displayName]) => (
        <ExperimentalFeaturesItem
          key={flag}
          title={'Block Suite: ' + displayName}
          checked={!!appSettings.editorFlags?.[flag as EditorFlag]}
          onChange={checked =>
            toggleSetting(flag as keyof BlockSuiteFlags, checked)
          }
        />
      ))}
    </>
  );
};

const ExperimentalFeaturesMain = () => {
  const t = useAFFiNEI18N();

  return (
    <>
      <SettingHeader
        title={t[
          'com.affine.settings.workspace.experimental-features.header.plugins'
        ]()}
      />
      <div
        className={styles.settingsContainer}
        data-testid="experimental-settings"
      >
        <SplitViewSettingRow />
        <BlocksuiteFeatureFlagSettings />
      </div>
    </>
  );
};

// todo: save to workspace meta instead?
const experimentalFeaturesDisclaimerAtom = atomWithStorage(
  'affine:experimental-features-disclaimer',
  false
);

export const ExperimentalFeatures = () => {
  const [enabled, setEnabled] = useAtom(experimentalFeaturesDisclaimerAtom);
  const handleConfirm = useAsyncCallback(async () => {
    setEnabled(true);
  }, [setEnabled]);
  if (!enabled) {
    return <ExperimentalFeaturesPrompt onConfirm={handleConfirm} />;
  } else {
    return (
      <Suspense fallback={<Loading />}>
        <ExperimentalFeaturesMain />
      </Suspense>
    );
  }
};
