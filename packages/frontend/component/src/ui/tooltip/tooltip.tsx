import type {
  TooltipContentProps,
  TooltipPortalProps,
  TooltipProps as RootProps,
} from '@radix-ui/react-tooltip';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cssVar } from '@toeverything/theme';
import { cssVarV2 } from '@toeverything/theme/v2';
import clsx from 'clsx';
import { type ReactElement, type ReactNode } from 'react';

import { getCommand } from '../../utils/keyboard-mapping';
import * as styles from './styles.css';

export interface TooltipProps {
  // `children` can not be string, number or even undefined
  children: ReactElement;
  content?: ReactNode;
  /**
   * When shortcut is provided, will use a single line layout
   *
   * ```tsx
   * <Tooltip shortcut="T" />             // [T]
   * <Tooltip shortcut="⌘ + K" />         // [⌘ + K]
   * <Tooltip shortcut={['⌘', 'K']} />    // [⌘] [K]
   * <Tooltip shortcut={['$mod', 'K']} /> // [⌘] [K] or [Ctrl] [K]
   * ```
   *
   * Mapping:
   * | Shortcut | macOS | Windows |
   * |----------|-------|---------|
   * | `$mod`   | `⌘`   | `Ctrl`  |
   * | `$alt`   | `⌥`   | `Alt`   |
   * | `$shift` | `⇧`   | `Shift` |
   */
  shortcut?: string | string[];
  side?: TooltipContentProps['side'];
  align?: TooltipContentProps['align'];

  rootOptions?: Omit<RootProps, 'children'>;
  portalOptions?: TooltipPortalProps;
  options?: Omit<TooltipContentProps, 'side' | 'align'>;
}

const TooltipShortcut = ({ shortcut }: { shortcut: string | string[] }) => {
  const commands = (Array.isArray(shortcut) ? shortcut : [shortcut])
    .map(cmd => cmd.trim())
    .map(cmd => getCommand(cmd));

  return (
    <div className={styles.shortcut}>
      {commands.map((cmd, index) => (
        <div
          key={`${index}-${cmd}`}
          className={styles.command}
          data-length={cmd.length}
        >
          {cmd}
        </div>
      ))}
    </div>
  );
};

export const Tooltip = ({
  children,
  content,
  side = 'top',
  align = 'center',
  shortcut,
  options,
  rootOptions,
  portalOptions,
}: TooltipProps) => {
  if (!content) {
    return children;
  }
  const { className, ...contentOptions } = options || {};
  const { style: contentStyle, ...restContentOptions } = contentOptions;
  return (
    <TooltipPrimitive.Root delayDuration={500} {...rootOptions}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>

      <TooltipPrimitive.Portal {...portalOptions}>
        <TooltipPrimitive.Content
          className={clsx(styles.tooltipContent, className)}
          side={side}
          align={align}
          sideOffset={5}
          style={{ zIndex: cssVar('zIndexPopover'), ...contentStyle }}
          {...restContentOptions}
        >
          {shortcut ? (
            <div className={styles.withShortcut}>
              <div className={styles.withShortcutContent}>{content}</div>
              <TooltipShortcut shortcut={shortcut} />
            </div>
          ) : (
            content
          )}
          <TooltipPrimitive.Arrow asChild>
            <svg
              width="10"
              height="6"
              viewBox="0 0 10 6"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4.11111 5.55C4.55556 6.15 5.44445 6.15 5.88889 5.55L10 0H0L4.11111 5.55Z"
                fill={cssVarV2('tooltips/background')}
              />
            </svg>
          </TooltipPrimitive.Arrow>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
