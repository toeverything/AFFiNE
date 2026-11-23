import { Switch } from '@affine/component';
import {
  AFFINE_FLAGS,
  FeatureFlagService,
  type Flag,
} from '@affine/core/modules/feature-flag';
import { useI18n } from '@affine/i18n';
import { ArrowRightSmallIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';
import { SwipeDialog } from '../swipe-dialog';
import * as styles from './styles.css';

export const ExperimentalFeatureSetting = () => {
  const [open, setOpen] = useState(false);
  const t = useI18n();
  const title = t['com.affine.mobile.setting.experimental.features']();

  return (
    <>
      <SettingGroup title={t['com.affine.mobile.setting.experimental.title']()}>
        <RowLayout label={title} onClick={() => setOpen(true)}>
          <ArrowRightSmallIcon fontSize={22} />
        </RowLayout>
      </SettingGroup>
      <SwipeDialog open={open} onOpenChange={setOpen} title={title}>
        <ExperimentalFeatureList />
      </SwipeDialog>
    </>
  );
};

const ExperimentalFeatureList = () => {
  const featureFlagService = useService(FeatureFlagService);

  return (
    <ul className={styles.content}>
      {Object.keys(AFFINE_FLAGS).map(key => (
        <ExperimentalFeaturesItem
          key={key}
          flagKey={key}
          flag={featureFlagService.flags[key as keyof AFFINE_FLAGS]}
        />
      ))}
    </ul>
  );
};

const ExperimentalFeaturesItem = ({
  flag,
  flagKey,
}: {
  flag: Flag;
  flagKey: string;
}) => {
  const t = useI18n();
  const value = useLiveData(flag.$);

  const onChange = useCallback(
    (checked: boolean) => {
      flag.set(checked);
    },
    [flag]
  );

  if (flag.configurable === false || flag.hide) {
    return null;
  }

  return (
    <li>
      <div className={styles.itemBlock}>
        {t[flag.displayName]()}
        <Switch data-testid={flagKey} checked={value} onChange={onChange} />
      </div>
      {flag.description ? (
        <div className={styles.itemDescription}>{t[flag.description]()}</div>
      ) : null}
    </li>
  );
};
