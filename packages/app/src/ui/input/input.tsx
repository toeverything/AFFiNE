import { InputHTMLAttributes, useState } from 'react';
import { StyledInput } from './style';

type inputProps = {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  maxLength?: number;
  onChange?: (value: string) => void;
  onBlur?: (e: any) => void;
};

export const Input = (props: inputProps) => {
  const {
    disabled,
    value: valueProp,
    placeholder,
    maxLength,
    width = 260,
    onChange,
    onBlur,
  } = props;
  const [value, setValue] = useState<string>(valueProp || '');
  const handleChange: InputHTMLAttributes<HTMLInputElement>['onChange'] = e => {
    setValue(e.target.value);
    onChange && onChange(e.target.value);
  };
  const handleBlur: InputHTMLAttributes<HTMLInputElement>['onBlur'] = e => {
    onBlur && onBlur(e);
  };
  return (
    <StyledInput
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      width={width}
      maxLength={maxLength}
      onChange={handleChange}
      onBlur={handleBlur}
    ></StyledInput>
  );
};
