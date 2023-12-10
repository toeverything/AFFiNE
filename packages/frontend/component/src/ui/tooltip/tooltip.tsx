import type {
  TooltipContentProps,
  TooltipPortalProps,
  TooltipProps as RootProps,
} from '@radix-ui/react-tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type { ReactElement, ReactNode } from 'react';

import * as styles from './styles.css';

export interface TooltipProps {
  // `children` can not be string, number or even undefined
  children: ReactElement;
  content?: ReactNode;
  side?: TooltipContentProps['side'];
  align?: TooltipContentProps['align'];

  rootOptions?: Omit<RootProps, 'children'>;
  portalOptions?: TooltipPortalProps;
  options?: Omit<TooltipContentProps, 'side' | 'align'>;
}

export const Tooltip = ({
  children,
  content,
  side = 'top',
  align = 'center',
  options,
  rootOptions,
  portalOptions,
}: TooltipProps) => {
  if (!content) {
    return children;
  }
  return (
    <TooltipPrimitive.Provider>
      <TooltipPrimitive.Root delayDuration={500} {...rootOptions}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>

        <TooltipPrimitive.Portal {...portalOptions}>
          <TooltipPrimitive.Content
            className={styles.tooltipContent}
            side={side}
            align={align}
            sideOffset={5}
            style={{ zIndex: 'var(--affine-z-index-popover)' }}
            {...options}
          >
            {content}
            <TooltipPrimitive.Arrow
              height={6}
              width={10}
              fill="var(--affine-tooltip)"
            />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
};
