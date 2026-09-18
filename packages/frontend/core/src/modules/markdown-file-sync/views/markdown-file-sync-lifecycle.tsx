import { useService } from '@toeverything/infra';
import { useEffect } from 'react';

import { MarkdownFileSyncService } from '../services/markdown-file-sync';

export function MarkdownFileSyncLifecycle() {
  const service = useService(MarkdownFileSyncService);

  useEffect(() => {
    service.setup();
  }, [service]);

  return null;
}
