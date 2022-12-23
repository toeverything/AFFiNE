import { InputHTMLAttributes, useEffect, useState } from 'react';
import { StyledInput } from './style';

type inputProps = {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  maxLength?: number;
  minLength?: number;
  onChange?: (value: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onBlur?: (e: any) => void;
};

export const Input = (props: inputProps) => {
  const {
    disabled,
    value: valueProp,
    placeholder,
    maxLength,
    minLength,
    width = 260,
    onChange,
    onBlur,
  } = props;
  const [value, setValue] = useState<string>(valueProp || '');
  const handleChange: InputHTMLAttributes<HTMLInputElement>['onChange'] = e => {
    if (
      (maxLength && e.target.value.length > maxLength) ||
      (minLength && e.target.value.length < minLength)
    )
      return;
    setValue(e.target.value);
    onChange && onChange(e.target.value);
  };
  const handleBlur: InputHTMLAttributes<HTMLInputElement>['onBlur'] = e => {
    onBlur && onBlur(e);
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
    ></StyledInput>
  );
};
