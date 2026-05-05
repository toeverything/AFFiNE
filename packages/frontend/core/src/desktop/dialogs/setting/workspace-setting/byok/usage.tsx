import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';

import * as styles from './index.css';
import { byokT } from './metadata';
import type { ByokKey, ByokUsagePoint } from './types';

export const UsagePanel = ({
  keys,
  usage,
  onClearAll,
}: {
  keys: ByokKey[];
  usage: ByokUsagePoint[];
  onClearAll: () => void;
}) => {
  const t = useI18n();

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <div>
          <div className={styles.title}>{byokT(t, 'usage.title')}</div>
          <div className={styles.description}>{byokT(t, 'usage.period')}</div>
        </div>
        <Button variant="error" disabled={!keys.length} onClick={onClearAll}>
          {byokT(t, 'action.clear-all')}
        </Button>
      </div>
      <div className={styles.chart}>
        {Array.from({ length: 30 }).map((_, index) => {
          const total = usage[index]?.totalTokens ?? 0;
          const height = Math.max(2, Math.min(120, total / 1000));
          return (
            <div
              className={styles.bar}
              key={index}
              style={{ height }}
              title={byokT(t, 'usage.tokens', { count: total })}
            />
          );
        })}
      </div>
    </div>
  );
};
