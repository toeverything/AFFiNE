import {
  InputHTMLAttributes,
  useEffect,
  useState,
  FocusEventHandler,
  KeyboardEventHandler,
} from 'react';
import { StyledInput } from './style';

type inputProps = {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  height?: number;
  maxLength?: number;
  minLength?: number;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
};
export const Input = (props: inputProps) => {
  const {
    disabled,
    value: valueProp,
    placeholder,
    maxLength,
    minLength,
    height,
    width = 260,
    onChange,
    onBlur,
    onKeyDown,
  } = props;
  const [value, setValue] = useState<string>(valueProp || '');
  const handleChange: InputHTMLAttributes<HTMLInputElement>['onChange'] = e => {
    const { value } = e.target;
    setValue(value);
    onChange && onChange(value);
  };

  const handleBlur: InputHTMLAttributes<HTMLInputElement>['onBlur'] = e => {
    onBlur && onBlur(e);
  };
  const handleKeyDown: InputHTMLAttributes<HTMLInputElement>['onKeyDown'] =
    e => {
      onKeyDown && onKeyDown(e);
    };
  useEffect(() => {
    setValue(valueProp || '');
  }, [valueProp]);
  return (
    <StyledInput
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      width={width}
      maxLength={maxLength}
      minLength={minLength}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      height={height}
    ></StyledInput>
  );
};
