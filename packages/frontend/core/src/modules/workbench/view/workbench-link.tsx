import { useCatchEventCallback } from '@affine/core/components/hooks/use-catch-event-hook';
import { isNewTabTrigger } from '@affine/core/utils';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { type To } from 'history';
import { forwardRef, type MouseEvent } from 'react';

import { WorkbenchService } from '../services/workbench';

export type WorkbenchLinkProps = React.PropsWithChildren<
  {
    to: To;
    onClick?: (e: MouseEvent) => void;
    replaceHistory?: boolean;
  } & React.HTMLProps<HTMLAnchorElement>
>;

export const WorkbenchLink = forwardRef<HTMLAnchorElement, WorkbenchLinkProps>(
  function WorkbenchLink({ to, onClick, replaceHistory, ...other }, ref) {
    const { featureFlagService, workbenchService } = useServices({
      FeatureFlagService,
      WorkbenchService,
    });
    const enableMultiView = useLiveData(
      featureFlagService.flags.enable_multi_view.$
    );
    const workbench = workbenchService.workbench;
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
            return BUILD_CONFIG.isElectron && event.altKey && enableMultiView
              ? 'tail'
              : 'new-tab';
          }
          return 'active';
        })();
        workbench.open(to, { at, replaceHistory });
        event.preventDefault();
      },
      [enableMultiView, onClick, replaceHistory, to, workbench]
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
  }
);
