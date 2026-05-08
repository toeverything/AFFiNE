import { useI18n } from '@affine/i18n';
import {
  ChatWithAiIcon,
  ImageIcon,
  PenIcon,
  TocIcon,
  TranscriptWithAiIcon,
} from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import * as styles from './index.css';
import { byokT, capabilityRows, warningDescription } from './metadata';
import type { ByokKey, ByokSettings } from './types';

function coverageIcon(
  icon: (typeof capabilityRows)[number]['icon']
): ReactNode {
  switch (icon) {
    case 'chat':
      return <ChatWithAiIcon className={styles.capabilityIconSvg} />;
    case 'action':
      return <PenIcon className={styles.capabilityIconSvg} />;
    case 'image':
      return <ImageIcon className={styles.capabilityIconSvg} />;
    case 'transcript':
      return <TranscriptWithAiIcon className={styles.capabilityIconSvg} />;
    case 'indexing':
      return <TocIcon className={styles.capabilityIconSvg} />;
  }
}

function isRowCovered(row: (typeof capabilityRows)[number], keys: ByokKey[]) {
  if (!row.coverageCapabilities.length) {
    return false;
  }

  return keys.some(key => {
    if (!key.configured || !key.enabled) {
      return false;
    }
    return (
      (!('storage' in row) || row.storage === key.storage) &&
      row.coverageCapabilities.every(capability =>
        key.capabilities.includes(capability)
      )
    );
  });
}

export const CoveragePanel = ({
  keys,
  settings,
}: {
  keys: ByokKey[];
  settings: ByokSettings;
}) => {
  const t = useI18n();

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div className={styles.title}>{byokT(t, 'coverage.title')}</div>
      </div>
      <div className={styles.rows}>
        {capabilityRows.map(row => {
          const warning = settings.warnings.find(
            w => w.featureKind === row.featureKind
          );
          const covered = isRowCovered(row, keys);
          return (
            <div
              className={`${styles.row} ${styles.capabilityRow} ${
                covered ? '' : styles.capabilityRowInactive
              }`}
              data-covered={covered}
              data-testid={`workspace-byok-coverage-${row.featureKind}`}
              key={row.featureKind}
            >
              <div
                className={`${styles.capabilityIcon} ${
                  covered ? styles.capabilityIconActive : ''
                }`}
              >
                {coverageIcon(row.icon)}
              </div>
              <div className={styles.rowMain}>
                <div className={styles.rowTitle}>{byokT(t, row.titleKey)}</div>
                <div className={styles.rowDescription}>
                  {warningDescription(t, warning) ?? byokT(t, row.fallbackKey)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
