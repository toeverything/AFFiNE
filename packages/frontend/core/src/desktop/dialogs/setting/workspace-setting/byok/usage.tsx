import { Button } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { useMemo } from 'react';

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
  const dailyUsage = useMemo(() => {
    const totals = new Map<string, number>();
    for (const point of usage) {
      const day = point.date.slice(0, 10);
      totals.set(day, (totals.get(day) ?? 0) + point.totalTokens);
    }

    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const startUtc = todayUtc - 29 * 24 * 60 * 60 * 1000;
    return Array.from({ length: 30 }).map((_, index) => {
      const day = new Date(startUtc + index * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      return totals.get(day) ?? 0;
    });
  }, [usage]);

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
        {dailyUsage.map((total, index) => {
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
