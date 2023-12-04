import { CloseIcon } from '@blocksuite/icons';
import {
  type AvatarFallbackProps,
  type AvatarImageProps,
  type AvatarProps as RadixAvatarProps,
  Fallback as AvatarFallback,
  Image as AvatarImage,
  Root as AvatarRoot,
} from '@radix-ui/react-avatar';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type { CSSProperties, HTMLAttributes, MouseEvent } from 'react';
import { forwardRef, type ReactElement, useMemo, useState } from 'react';

import { IconButton } from '../button';
import { Tooltip, type TooltipProps } from '../tooltip';
import { ColorfulFallback } from './colorful-fallback';
import * as style from './style.css';
import { sizeVar } from './style.css';

export type AvatarProps = {
  size?: number;
  url?: string | null;
  name?: string;
  className?: string;
  style?: CSSProperties;
  colorfulFallback?: boolean;
  hoverIcon?: ReactElement;
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
  avatarTooltipOptions?: Omit<TooltipProps, 'children'>;
  removeTooltipOptions?: Omit<TooltipProps, 'children'>;

  fallbackProps?: AvatarFallbackProps;
  imageProps?: Omit<AvatarImageProps, 'src'>;
  avatarProps?: RadixAvatarProps;
  hoverWrapperProps?: HTMLAttributes<HTMLDivElement>;
  removeButtonProps?: HTMLAttributes<HTMLButtonElement>;
} & HTMLAttributes<HTMLSpanElement>;

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  (
    {
      size = 20,
      style: propsStyles = {},
      url,
      name,
      className,
      colorfulFallback = false,
      hoverIcon,
      fallbackProps: { className: fallbackClassName, ...fallbackProps } = {},
      imageProps,
      avatarProps,
      onRemove,
      hoverWrapperProps: {
        className: hoverWrapperClassName,
        ...hoverWrapperProps
      } = {},
      avatarTooltipOptions,
      removeTooltipOptions,
      removeButtonProps: {
        className: removeButtonClassName,
        ...removeButtonProps
      } = {},
      ...props
    },
    ref
  ) => {
    const firstCharOfName = useMemo(() => {
      return name?.slice(0, 1) || 'A';
    }, [name]);
    const [imageDom, setImageDom] = useState<HTMLDivElement | null>(null);
    const [removeButtonDom, setRemoveButtonDom] =
      useState<HTMLButtonElement | null>(null);

    return (
      <AvatarRoot className={style.avatarRoot} {...avatarProps} ref={ref}>
        <Tooltip
          portalOptions={{ container: imageDom }}
          {...avatarTooltipOptions}
        >
          <div
            ref={setImageDom}
            className={clsx(style.avatarWrapper, className)}
            style={{
              ...assignInlineVars({
                [sizeVar]: size ? `${size}px` : '20px',
              }),
              ...propsStyles,
            }}
            {...props}
          >
            <AvatarImage
              className={style.avatarImage}
              src={url || ''}
              alt={name}
              {...imageProps}
            />

            <AvatarFallback
              className={clsx(style.avatarFallback, fallbackClassName)}
              delayMs={url ? 600 : undefined}
              {...fallbackProps}
            >
              {colorfulFallback ? (
                <ColorfulFallback char={firstCharOfName} />
              ) : (
                firstCharOfName
              )}
            </AvatarFallback>
            {hoverIcon ? (
              <div
                className={clsx(style.hoverWrapper, hoverWrapperClassName)}
                {...hoverWrapperProps}
              >
                {hoverIcon}
              </div>
            ) : null}
          </div>
        </Tooltip>

        {onRemove ? (
          <Tooltip
            portalOptions={{ container: removeButtonDom }}
            {...removeTooltipOptions}
          >
            <IconButton
              size="extraSmall"
              type="default"
              className={clsx(style.removeButton, removeButtonClassName)}
              onClick={onRemove}
              ref={setRemoveButtonDom}
              {...removeButtonProps}
            >
              <CloseIcon />
            </IconButton>
          </Tooltip>
        ) : null}
      </AvatarRoot>
    );
  }
);

Avatar.displayName = 'Avatar';
