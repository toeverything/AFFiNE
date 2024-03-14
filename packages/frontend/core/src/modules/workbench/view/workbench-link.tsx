import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useService } from '@toeverything/infra/di';
import type { To } from 'history';
import { useCallback } from 'react';

import { Workbench } from '../entities/workbench';

export const WorkbenchLink = ({
  to,
  children,
  onClick,
  ...other
}: React.PropsWithChildren<
  { to: To } & React.HTMLProps<HTMLAnchorElement>
>) => {
  const workbench = useService(Workbench);
  const { appSettings } = useAppSettingHelper();
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      // TODO: open this when multi view control is implemented
      if (
        appSettings.enableMultiView &&
        environment.isDesktop &&
        (event.ctrlKey || event.metaKey)
      ) {
        workbench.open(to, { at: 'beside' });
      } else {
        workbench.open(to);
      }

      onClick?.(event);
    },
    [appSettings.enableMultiView, onClick, to, workbench]
  );
  return (
    <a {...other} href="#" onClick={handleClick}>
      {children}
    </a>
  );
};
