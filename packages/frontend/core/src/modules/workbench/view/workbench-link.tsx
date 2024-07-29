import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { popupWindow } from '@affine/core/utils';
import { apis } from '@affine/electron-api';
import { useLiveData, useService } from '@toeverything/infra';
import { parsePath, type To } from 'history';
import { forwardRef, type MouseEvent } from 'react';

import { WorkbenchService } from '../services/workbench';

export const WorkbenchLink = forwardRef<
  HTMLAnchorElement,
  React.PropsWithChildren<
    {
      to: To;
      onClick?: (e: MouseEvent) => boolean | void; // return false to stop propagation
    } & React.HTMLProps<HTMLAnchorElement>
  >
>(function WorkbenchLink({ to, onClick, ...other }, ref) {
  const workbench = useService(WorkbenchService).workbench;
  const { appSettings } = useAppSettingHelper();
  const basename = useLiveData(workbench.basename$);
  const link =
    basename +
    (typeof to === 'string' ? to : `${to.pathname}${to.search}${to.hash}`);
  const handleClick = useAsyncCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (onClick?.(event) === false) {
        return;
      }

      if (event.ctrlKey || event.metaKey) {
        if (environment.isDesktop) {
          if (event.altKey && appSettings.enableMultiView) {
            workbench.open(to, { at: 'tail' });
          } else {
            const path = typeof to === 'string' ? parsePath(to) : to;
            await apis?.ui.addTab({
              basename,
              view: { path },
            });
          }
        } else if (!environment.isDesktop) {
          popupWindow(link);
        }
      } else {
        workbench.open(to);
      }
    },
    [appSettings.enableMultiView, basename, link, onClick, to, workbench]
  );

  // eslint suspicious runtime error
  // eslint-disable-next-line react/no-danger-with-children
  return <a {...other} ref={ref} href={link} onClick={handleClick} />;
});
