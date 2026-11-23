import { useService } from '@toeverything/infra';
import { useEffect, useMemo } from 'react';

import { MobileBackCoordinator } from './back-coordinator';

export const useMobileVisualLayer = ({
  enabled,
  parent,
  interactive = true,
  onBack,
}: {
  enabled: boolean | undefined;
  parent?: symbol;
  interactive?: boolean;
  onBack: () => void;
}) => {
  const coordinator = useService(MobileBackCoordinator);
  const id = useMemo(() => Symbol('mobile-visual-layer'), []);
  useEffect(() => {
    if (!enabled) return;
    return coordinator.registerVisual({
      id,
      parent,
      interactive,
      handle: onBack,
    }).dispose;
  }, [coordinator, enabled, id, interactive, onBack, parent]);
  return id;
};
