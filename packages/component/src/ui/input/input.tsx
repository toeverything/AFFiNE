import { assignInlineVars } from '@vanilla-extract/dynamic';
import clsx from 'clsx';
import type {
  ChangeEventHandler,
  CSSProperties,
  FocusEventHandler,
  ForwardedRef,
  HTMLAttributes,
  KeyboardEventHandler,
} from 'react';
import { forwardRef, useCallback } from 'react';

import { heightVar, inputVariantStyle, widthVar } from './index.css';

type inputProps = {
  value?: string;
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
} & Omit<HTMLAttributes<HTMLInputElement>, 'onChange'>;

export const Input = forwardRef<HTMLInputElement, inputProps>(function Input(
  {
    disabled,
    value,
    placeholder,
    maxLength,
    minLength,
    height,
    width,
    onChange,
    noBorder = false,
    ...otherProps
  }: inputProps,
  ref: ForwardedRef<HTMLInputElement>
) {
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    e => {
      const { value } = e.target;
      onChange && onChange(value);
    },
    [onChange]
  );

  return (
    <input
      className={clsx(
        otherProps.className,
        disabled ? inputVariantStyle.disabled : inputVariantStyle.enabled,
        noBorder && inputVariantStyle.noBorder
      )}
      style={assignInlineVars({
        [widthVar]: width ? `${width}px` : '100%',
        [heightVar]: height ? `${height}px` : 'unset',
      })}
      ref={ref}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      width={width}
      maxLength={maxLength}
      minLength={minLength}
      onChange={handleChange}
      height={height}
      {...otherProps}
    />
  );
});
