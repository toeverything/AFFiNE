import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import { useCompositionInput } from 'foxact/use-composition-input';
import type {
  CSSProperties,
  FocusEventHandler,
  ForwardedRef,
  HTMLAttributes,
  KeyboardEventHandler,
} from 'react';
import { forwardRef, useCallback } from 'react';

import { heightVar, inputStyle, widthVar } from './index.css';

type InputProps = {
  // We don't have `value` props here,
  //  see https://foxact.skk.moe/use-composition-input
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
} & Omit<
  HTMLAttributes<HTMLInputElement>,
  | 'onChange'
  | 'value'
  | 'defaultValue'
  | 'onCompositionStart'
  | 'onCompositionEnd'
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
    onChange,
    noBorder = false,
    className,
    ...otherProps
  }: InputProps,
  ref: ForwardedRef<HTMLInputElement>
) {
  const inputProps = useCompositionInput(
    useCallback(
      (value: string) => {
        onChange && onChange(value);
      },
      [onChange]
    )
  );

  return (
    <input
      className={clsx(inputStyle, className)}
      style={assignInlineVars({
        [widthVar]: width ? `${width}px` : '100%',
        [heightVar]: height ? `${height}px` : 'unset',
      })}
      data-no-border={noBorder}
      data-disabled={disabled}
      ref={ref}
      defaultValue={defaultValue}
      disabled={disabled}
      placeholder={placeholder}
      width={width}
      maxLength={maxLength}
      minLength={minLength}
      height={height}
      {...otherProps}
      {...inputProps}
    />
  );
});
