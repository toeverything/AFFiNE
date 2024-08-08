import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useCatchEventCallback } from '@affine/core/hooks/use-catch-event-hook';
import { isNewTabTrigger } from '@affine/core/utils';
import { useLiveData, useService } from '@toeverything/infra';
import { type To } from 'history';
import { forwardRef, type MouseEvent } from 'react';

import { WorkbenchService } from '../services/workbench';

export const WorkbenchLink = forwardRef<
  HTMLAnchorElement,
  React.PropsWithChildren<
    {
      to: To;
      onClick?: (e: MouseEvent) => void;
    } & React.HTMLProps<HTMLAnchorElement>
  >
>(function WorkbenchLink({ to, onClick, ...other }, ref) {
  const workbench = useService(WorkbenchService).workbench;
  const { appSettings } = useAppSettingHelper();
  const basename = useLiveData(workbench.basename$);
  const link =
    basename +
    (typeof to === 'string' ? to : `${to.pathname}${to.search}${to.hash}`);
  const handleClick = useCatchEventCallback(
    async (event: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) {
        return;
      }
      const at = (() => {
        if (isNewTabTrigger(event)) {
          return event.altKey && appSettings.enableMultiView
            ? 'tail'
            : 'new-tab';
        }
        return 'active';
      })();
      workbench.open(to, { at });
      event.preventDefault();
    },
    [appSettings.enableMultiView, onClick, to, workbench]
  );

  // eslint suspicious runtime error
  // eslint-disable-next-line react/no-danger-with-children
  return (
    <a
      {...other}
      ref={ref}
      href={link}
      onClick={handleClick}
      onAuxClick={handleClick}
    />
  );
});
