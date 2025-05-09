import { CloseIcon } from '@blocksuite/icons/rc';
import type {
  AvatarFallbackProps,
  AvatarImageProps,
  AvatarProps as RadixAvatarProps,
} from '@radix-ui/react-avatar';
import {
  Fallback as AvatarFallback,
  Image as AvatarImage,
  Root as AvatarRoot,
} from '@radix-ui/react-avatar';
import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type {
  CSSProperties,
  HTMLAttributes,
  MouseEvent,
  ReactElement,
} from 'react';
import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

import { withUnit } from '../../utils/with-unit';
import { IconButton } from '../button';
import type { TooltipProps } from '../tooltip';
import { Tooltip } from '../tooltip';
import { ColorfulFallback } from './colorful-fallback';
import * as style from './style.css';
import { blurVar, sizeVar } from './style.css';

export type AvatarProps = {
  size?: number;
  url?: string | null;
  image?: ImageBitmap /* use pre-loaded image data can avoid flashing */;
  name?: string;
  className?: string;
  style?: CSSProperties;
  colorfulFallback?: boolean;
  hoverIcon?: ReactElement;
  onRemove?: (e: MouseEvent<HTMLButtonElement>) => void;
  avatarTooltipOptions?: Omit<TooltipProps, 'children'>;
  removeTooltipOptions?: Omit<TooltipProps, 'children'>;
  /**
   * Same as `CSS.borderRadius`, number in px or string with unit
   * @default '50%'
   */
  rounded?: number | string;

  fallbackProps?: AvatarFallbackProps;
  imageProps?: Omit<
    AvatarImageProps & React.HTMLProps<HTMLCanvasElement>,
    'src' | 'ref'
  >;
  avatarProps?: RadixAvatarProps;
  hoverWrapperProps?: HTMLAttributes<HTMLDivElement>;
  removeButtonProps?: HTMLAttributes<HTMLButtonElement>;
} & HTMLAttributes<HTMLSpanElement>;

function drawImageFit(
  img: ImageBitmap,
  ctx: CanvasRenderingContext2D,
  size: number
) {
  const hRatio = size / img.width;
  const vRatio = size / img.height;
  const ratio = Math.max(hRatio, vRatio);
  const centerShift_x = (size - img.width * ratio) / 2;
  const centerShift_y = (size - img.height * ratio) / 2;
  ctx.drawImage(
    img,
    0,
    0,
    img.width,
    img.height,
    centerShift_x,
    centerShift_y,
    img.width * ratio,
    img.height * ratio
  );
}

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(
  (
    {
      size = 20,
      style: propsStyles = {},
      url,
      image,
      name,
      className,
      colorfulFallback = false,
      hoverIcon,
      fallbackProps: { className: fallbackClassName, ...fallbackProps } = {},
      imageProps,
      avatarProps,
      rounded = '50%',
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
      return name?.slice(0, 1);
    }, [name]);
    const [containerDom, setContainerDom] = useState<HTMLDivElement | null>(
      null
    );
    const [removeButtonDom, setRemoveButtonDom] =
      useState<HTMLButtonElement | null>(null);
    const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

    useLayoutEffect(() => {
      if (canvas && image) {
        const ctx = canvas?.getContext('2d');
        if (ctx) {
          drawImageFit(image, ctx, size * window.devicePixelRatio);
        }
      }
      return;
    }, [canvas, image, size]);

    const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
      setCanvas(node);
    }, []);

    return (
      <AvatarRoot className={style.avatarRoot} {...avatarProps} ref={ref}>
        <Tooltip
          portalOptions={{ container: containerDom }}
          {...avatarTooltipOptions}
        >
          <div
            ref={setContainerDom}
            className={clsx(style.avatarWrapper, className)}
            style={{
              ...assignInlineVars({
                [sizeVar]: size ? `${size}px` : '20px',
                [blurVar]: `${size * 0.3}px`,
                borderRadius: withUnit(rounded, 'px'),
              }),
              ...propsStyles,
            }}
            {...props}
          >
            {image /* canvas mode */ ? (
              <canvas
                className={style.avatarImage}
                ref={canvasRef}
                width={size * window.devicePixelRatio}
                height={size * window.devicePixelRatio}
                {...imageProps}
              />
            ) : (
              <AvatarImage
                className={style.avatarImage}
                src={url || ''}
                alt={name}
                {...imageProps}
              />
            )}

            {!image /* no fallback on canvas mode */ &&
              (firstCharOfName ? (
                /* if name is not empty, use first char of name as fallback */
                <AvatarFallback
                  className={clsx(style.avatarFallback, fallbackClassName)}
                  delayMs={url ? 600 : undefined}
                  {...fallbackProps}
                >
                  {colorfulFallback ? (
                    <ColorfulFallback char={firstCharOfName} />
                  ) : (
                    firstCharOfName.toUpperCase()
                  )}
                </AvatarFallback>
              ) : (
                /* if name is empty, use default fallback */
                <AvatarFallback
                  className={clsx(
                    style.avatarDefaultFallback,
                    fallbackClassName
                  )}
                  delayMs={url ? 600 : undefined}
                  {...fallbackProps}
                >
                  <DefaultFallbackSvg />
                </AvatarFallback>
              ))}
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
          <IconButton
            tooltipOptions={{
              portalOptions: { container: removeButtonDom },
              ...removeTooltipOptions,
            }}
            variant="solid"
            size="12"
            className={clsx(style.removeButton, removeButtonClassName)}
            onClick={onRemove}
            ref={setRemoveButtonDom}
            {...removeButtonProps}
          >
            <CloseIcon />
          </IconButton>
        ) : null}
      </AvatarRoot>
    );
  }
);

Avatar.displayName = 'Avatar';

const DefaultFallbackSvg = () => {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M11 12.1C13.2912 12.1 15.1486 10.2285 15.1486 7.92C15.1486 5.61145 13.2912 3.74 11 3.74C8.70881 3.74 6.85143 5.61145 6.85143 7.92C6.85143 10.2285 8.70881 12.1 11 12.1Z"
        fill="black"
        fillOpacity="0.22"
      />
      <path
        d="M1.68 24.64C1.48118 24.64 1.31933 24.4782 1.32649 24.2795C1.51473 19.0599 5.77368 14.8867 11 14.8867C16.2263 14.8867 20.4853 19.0599 20.6735 24.2795C20.6807 24.4782 20.5188 24.64 20.32 24.64H1.68Z"
        fill="black"
        fillOpacity="0.22"
      />
    </svg>
  );
};
