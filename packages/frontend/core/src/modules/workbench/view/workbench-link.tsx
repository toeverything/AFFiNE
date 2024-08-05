import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useAsyncCallback } from '@affine/core/hooks/affine-async-hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { type To } from 'history';
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

      const at = (() => {
        if (event.ctrlKey || event.metaKey) {
          return event.altKey && appSettings.enableMultiView
            ? 'tail'
            : 'new-tab';
        }
        return 'active';
      })();

      workbench.open(to, { at });
    },
    [appSettings.enableMultiView, onClick, to, workbench]
  );

  // eslint suspicious runtime error
  // eslint-disable-next-line react/no-danger-with-children
  return <a {...other} ref={ref} href={link} onClick={handleClick} />;
});
