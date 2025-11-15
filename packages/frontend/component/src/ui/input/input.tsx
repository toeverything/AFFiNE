import clsx from 'clsx';
import type {
  CSSProperties,
  ForwardedRef,
  InputHTMLAttributes,
  KeyboardEventHandler,
  ReactNode,
} from 'react';
import { forwardRef } from 'react';

import { RowInput } from './row-input';
import { input, inputWrapper, mobileInputWrapper } from './style.css';

export type InputProps = {
  disabled?: boolean;
  onChange?: (value: string) => void;
  onBlur?: (ev: FocusEvent & { currentTarget: HTMLInputElement }) => void;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  autoSelect?: boolean;
  noBorder?: boolean;
  status?: 'error' | 'success' | 'warning' | 'default';
  size?: 'default' | 'large' | 'extraLarge';
  preFix?: ReactNode;
  endFix?: ReactNode;
  type?: HTMLInputElement['type'];
  inputStyle?: CSSProperties;
  onEnter?: (value: string) => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size' | 'onBlur'>;

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
    onBlur,
    autoFocus,
    autoSelect,
    ...otherProps
  }: InputProps,
  upstreamRef: ForwardedRef<HTMLInputElement>
) {
  return (
    <div
      className={clsx(
        BUILD_CONFIG.isMobileEdition ? mobileInputWrapper : inputWrapper,
        className,
        {
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
        }
      )}
      style={{
        ...style,
      }}
    >
      {preFix}
      <RowInput
        className={clsx(input, {
          large: size === 'large',
          'extra-large': size === 'extraLarge',
        })}
        ref={upstreamRef}
        disabled={disabled}
        style={inputStyle}
        onChange={propsOnChange}
        onEnter={onEnter}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        autoFocus={autoFocus}
        autoSelect={autoSelect}
        {...otherProps}
      />
      {endFix}
    </div>
  );
});
