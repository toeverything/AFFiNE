import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { ToggleRightIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  forwardRef,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
} from 'react';

import {
  content,
  triggerActions,
  triggerCollapseIcon,
  triggerLabel,
  triggerRoot,
} from './collapsible-section.css';

interface CollapsibleSectionProps extends HTMLAttributes<HTMLDivElement> {
  path: string[];
  title: string;
  actions?: ReactNode;
  testId?: string;
  headerTestId?: string;
  headerClassName?: string;
  contentClassName?: string;
}

interface CollapsibleSectionTriggerProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  collapsed?: boolean;
  actions?: ReactNode;
  setCollapsed?: (collapsed: boolean) => void;
}

const CollapsibleSectionTrigger = forwardRef<
  HTMLDivElement,
  CollapsibleSectionTriggerProps
>(function CollapsibleSectionTrigger(
  { actions, label, collapsed, setCollapsed, className, ...attrs },
  ref
) {
  const collapsible = collapsed !== undefined;
  return (
    <div
      className={clsx(triggerRoot, className)}
      ref={ref}
      role="switch"
      onClick={() => setCollapsed?.(!collapsed)}
      data-collapsed={collapsed}
      data-collapsible={collapsible}
      {...attrs}
    >
      <div className={triggerLabel}>
        {label}
        {collapsible ? (
          <ToggleRightIcon
            width={16}
            height={16}
            data-testid="category-divider-collapse-button"
            className={triggerCollapseIcon}
          />
        ) : null}
      </div>
      <div className={triggerActions} onClick={e => e.stopPropagation()}>
        {actions}
      </div>
    </div>
  );
});

export const CollapsibleSection = ({
  path,
  title,
  actions,
  testId,
  headerClassName,
  headerTestId,
  contentClassName,
  children,
  ...attrs
}: CollapsibleSectionProps) => {
  const navigationPanelService = useService(NavigationPanelService);
  const collapsed = useLiveData(navigationPanelService.collapsed$(path));

  const setCollapsed = useCallback(
    (v: boolean) => navigationPanelService.setCollapsed(path, v),
    [navigationPanelService, path]
  );

  return (
    <Collapsible.Root
      data-collapsed={collapsed}
      open={!collapsed}
      data-testid={testId}
      {...attrs}
    >
      <CollapsibleSectionTrigger
        label={title}
        actions={actions}
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        data-testid={headerTestId}
        className={headerClassName}
      />
      <Collapsible.Content
        data-testid="collapsible-section-content"
        className={clsx(content, contentClassName)}
      >
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
