import { Button, Checkbox, Loading, Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import {
  useSetWorkspaceFeature,
  useWorkspaceAvailableFeatures,
  useWorkspaceEnabledFeatures,
} from '@affine/core/hooks/use-workspace-features';
import { FeatureType } from '@affine/graphql';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { WorkspaceMetadata } from '@toeverything/infra';
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
    <div className={styles.promptRoot}>
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
        <Checkbox checked={checked} onChange={onChange} />
        {t[
          'com.affine.settings.workspace.experimental-features.prompt-disclaimer'
        ]()}
      </label>

      <div className={styles.promptDisclaimerConfirm}>
        <Button disabled={!checked} onClick={onConfirm} type="primary">
          {t[
            'com.affine.settings.workspace.experimental-features.get-started'
          ]()}
        </Button>
      </div>
    </div>
  );
};

interface ExperimentalFeaturesItemProps {
  feature: FeatureType;
  title: React.ReactNode;
  workspaceMetadata: WorkspaceMetadata;
}

const ExperimentalFeaturesItem = ({
  feature,
  title,
  workspaceMetadata,
}: ExperimentalFeaturesItemProps) => {
  const enabledFeatures = useWorkspaceEnabledFeatures(workspaceMetadata);
  const enabled = enabledFeatures.includes(feature);
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const { trigger, isMutating } = useSetWorkspaceFeature(workspaceMetadata);
  const onChange = useCallback(
    (checked: boolean) => {
      setLocalEnabled(checked);
      trigger(feature, checked);
    },
    [trigger, feature]
  );

  return (
    <div className={styles.switchRow}>
      {title}
      <Switch
        checked={localEnabled}
        onChange={onChange}
        className={isMutating ? styles.switchDisabled : ''}
      />
    </div>
  );
};

const ExperimentalFeaturesMain = ({
  workspaceMetadata,
}: {
  workspaceMetadata: WorkspaceMetadata;
}) => {
  const t = useAFFiNEI18N();
  const features = useWorkspaceAvailableFeatures(workspaceMetadata);

  return (
    <>
      <SettingHeader
        title={t[
          'com.affine.settings.workspace.experimental-features.header.plugins'
        ]()}
      />

      {features.includes(FeatureType.Copilot) ? (
        <ExperimentalFeaturesItem
          title="AI POC"
          workspaceMetadata={workspaceMetadata}
          feature={FeatureType.Copilot}
        />
      ) : null}
    </>
  );
};

// todo: save to workspace meta instead?
const experimentalFeaturesDisclaimerAtom = atomWithStorage(
  'affine:experimental-features-disclaimer',
  false
);

export const ExperimentalFeatures = ({
  workspaceMetadata,
}: {
  workspaceMetadata: WorkspaceMetadata;
}) => {
  const [enabled, setEnabled] = useAtom(experimentalFeaturesDisclaimerAtom);
  const handleConfirm = useAsyncCallback(async () => {
    setEnabled(true);
  }, [setEnabled]);
  if (!enabled) {
    return <ExperimentalFeaturesPrompt onConfirm={handleConfirm} />;
  } else {
    return (
      <Suspense fallback={<Loading />}>
        <ExperimentalFeaturesMain workspaceMetadata={workspaceMetadata} />
      </Suspense>
    );
  }
};
