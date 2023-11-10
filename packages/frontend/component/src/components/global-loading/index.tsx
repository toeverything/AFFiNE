import { useAtomValue } from 'jotai';
import { type ReactNode, useEffect, useState } from 'react';

import { Loading } from '../../ui/loading';
import * as styles from './index.css';
import { globalLoadingEventsAtom } from './index.jotai';

export {
  type GlobalLoadingEvent,
  pushGlobalLoadingEventAtom,
  resolveGlobalLoadingEventAtom,
} from './index.jotai';

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
