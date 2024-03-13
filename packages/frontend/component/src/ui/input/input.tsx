import clsx from 'clsx';
import type {
  ChangeEvent,
  CSSProperties,
  FocusEventHandler,
  ForwardedRef,
  InputHTMLAttributes,
  KeyboardEvent,
  KeyboardEventHandler,
  ReactNode,
} from 'react';
import { forwardRef, useCallback } from 'react';

import { input, inputWrapper } from './style.css';

export type InputProps = {
  disabled?: boolean;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  noBorder?: boolean;
  status?: 'error' | 'success' | 'warning' | 'default';
  size?: 'default' | 'large' | 'extraLarge';
  preFix?: ReactNode;
  endFix?: ReactNode;
  type?: HTMLInputElement['type'];
  inputStyle?: CSSProperties;
  onEnter?: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    disabled,
    onChange: propsOnChange,
    noBorder = false,
    className,
    status = 'default',
    style = {},
    inputStyle = {},
    size = 'default',
    preFix,
    endFix,
    onEnter,
    onKeyDown,
    autoFocus,
    ...otherProps
  }: InputProps,
  ref: ForwardedRef<HTMLInputElement>
) {
  const handleAutoFocus = useCallback((ref: HTMLInputElement | null) => {
    if (ref) {
      window.setTimeout(() => ref.focus(), 0);
    }
  }, []);

  return (
    <div
      className={clsx(inputWrapper, className, {
        // status
        disabled: disabled,
        'no-border': noBorder,
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
        ...style,
      }}
    >
      {preFix}
      <input
        className={clsx(input, {
          large: size === 'large',
          'extra-large': size === 'extraLarge',
        })}
        ref={autoFocus ? handleAutoFocus : ref}
        disabled={disabled}
        style={inputStyle}
        onChange={useCallback(
          (e: ChangeEvent<HTMLInputElement>) => {
            propsOnChange?.(e.target.value);
          },
          [propsOnChange]
        )}
        onKeyDown={useCallback(
          (e: KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              onEnter?.();
            }
            onKeyDown?.(e);
          },
          [onKeyDown, onEnter]
        )}
        {...otherProps}
      />
      {endFix}
    </div>
  );
});
