import { Loading } from '@affine/component';
import { globalLoadingEventsAtom } from '@affine/component/global-loading/index.jotai';
import { useAtomValue } from 'jotai';
import { type ReactNode, useEffect, useState } from 'react';

import * as styles from './index.css';

export function GlobalLoading(): ReactNode {
  const globalLoadingEvents = useAtomValue(globalLoadingEventsAtom);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (globalLoadingEvents.length) {
      setLoading(true);
    } else {
      setLoading(false);
    }
  }, [globalLoadingEvents]);

  if (!globalLoadingEvents.length) {
    return null;
  }
  return (
    <div className={styles.globalLoadingWrapperStyle} data-loading={loading}>
      <Loading size={20} />
    </div>
  );
}
