import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
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
  const basename = useLiveData(workbench.basename);
  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (event.ctrlKey || event.metaKey) {
        if (appSettings.enableMultiView && environment.isDesktop) {
          workbench.open(to, { at: 'beside' });
        } else if (!environment.isDesktop) {
          const href =
            typeof to === 'string'
              ? to
              : `${to.pathname}${to.search}${to.hash}`;
          window.open(basename + href, '_blank');
        }
      } else {
        workbench.open(to);
      }
      onClick?.(event);
    },
    [appSettings.enableMultiView, basename, onClick, to, workbench]
  );
  return (
    <a {...other} href="#" onClick={handleClick}>
      {children}
    </a>
  );
};
