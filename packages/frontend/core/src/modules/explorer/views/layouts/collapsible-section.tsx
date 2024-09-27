import { CategoryDivider } from '@affine/core/modules/app-sidebar/views';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type PropsWithChildren,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
} from 'react';

import { ExplorerService } from '../../services/explorer';
import type { CollapsibleSectionName } from '../../types';
import { ExplorerMobileContext } from '../mobile.context';
import {
  content,
  header,
  mobileContent,
  root,
} from './collapsible-section.css';

interface CollapsibleSectionProps extends PropsWithChildren {
  name: CollapsibleSectionName;
  title: string;
  actions?: ReactNode;

  className?: string;
  testId?: string;

  headerRef?: RefObject<HTMLDivElement>;
  headerTestId?: string;
  headerClassName?: string;

  contentClassName?: string;
}

export const CollapsibleSection = ({
  name,
  title,
  actions,
  children,

  className,
  testId,

  headerRef,
  headerTestId,
  headerClassName,

  contentClassName,
}: CollapsibleSectionProps) => {
  const mobile = useContext(ExplorerMobileContext);
  const section = useService(ExplorerService).sections[name];

  const collapsed = useLiveData(section.collapsed$);

  const setCollapsed = useCallback(
    (v: boolean) => {
      section.setCollapsed(v);
    },
    [section]
  );

  return (
    <Collapsible.Root
      data-collapsed={collapsed}
      className={clsx(root, className)}
      open={!collapsed}
      data-testid={testId}
    >
      <CategoryDivider
        mobile={mobile}
        data-testid={headerTestId}
        label={title}
        setCollapsed={setCollapsed}
        collapsed={collapsed}
        ref={headerRef}
        className={clsx(header, headerClassName)}
      >
        {actions}
      </CategoryDivider>
      <Collapsible.Content
        data-testid="collapsible-section-content"
        className={clsx(mobile ? mobileContent : content, contentClassName)}
      >
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
