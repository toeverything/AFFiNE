import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type {
  ChangeEvent,
  CSSProperties,
  FocusEvent,
  FocusEventHandler,
  ForwardedRef,
  HTMLAttributes,
  KeyboardEventHandler,
  ReactNode,
} from 'react';
import { forwardRef, useCallback, useState } from 'react';

import { input, inputWrapper, widthVar } from './index.css';

export type InputProps = {
  defaultValue?: string | undefined;
  placeholder?: string;
  disabled?: boolean;
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
  maxLength?: number;
  minLength?: number;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  noBorder?: boolean;
  status?: 'error' | 'success' | 'warning' | 'default';
  size?: 'default' | 'large' | 'extraLarge';
  preFix?: ReactNode;
  endFix?: ReactNode;
  value?: string;
  type?: HTMLInputElement['type'];
  inputStyle?: CSSProperties;
} & Omit<
  HTMLAttributes<HTMLInputElement>,
  'onChange' | 'onCompositionStart' | 'onCompositionEnd'
>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    disabled,
    defaultValue,
    placeholder,
    maxLength,
    minLength,
    height,
    width,
    onChange: propsOnChange,
    noBorder = false,
    className,
    status = 'default',
    style = {},
    inputStyle = {},
    size = 'default',
    onFocus,
    onBlur,
    preFix,
    endFix,
    ...otherProps
  }: InputProps,
  ref: ForwardedRef<HTMLInputElement>
) {
  const [isFocus, setIsFocus] = useState(false);

  return (
    <div
      className={clsx(inputWrapper, className, {
        // status
        disabled: disabled,
        'no-border': noBorder,
        focus: isFocus,
        // color
        error: status === 'error',
        success: status === 'success',
        warning: status === 'warning',
        default: status === 'default',
        // size
        large: size === 'large',
        'extra-large': size === 'extraLarge',
      })}
      style={{
        ...assignInlineVars({
          [widthVar]: width ? `${width}px` : '100%',
        }),
        ...style,
      }}
    >
      {preFix}
      <input
        className={clsx(input)}
        ref={ref}
        defaultValue={defaultValue}
        disabled={disabled}
        placeholder={placeholder}
        width={width}
        maxLength={maxLength}
        minLength={minLength}
        height={height}
        style={inputStyle}
        onFocus={useCallback(
          (e: FocusEvent<HTMLInputElement>) => {
            setIsFocus(true);
            onFocus?.(e);
          },
          [onFocus]
        )}
        onBlur={useCallback(
          (e: FocusEvent<HTMLInputElement>) => {
            setIsFocus(false);
            onBlur?.(e);
          },
          [onBlur]
        )}
        onChange={useCallback(
          (e: ChangeEvent<HTMLInputElement>) => {
            propsOnChange?.(e.target.value);
          },
          [propsOnChange]
        )}
        {...otherProps}
      />
      {endFix}
    </div>
  );
});
