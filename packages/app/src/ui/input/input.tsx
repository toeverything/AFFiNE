import { InputHTMLAttributes, useState } from 'react';
import { StyledInput } from './style';

type inputProps = {
  value?: string;
  placeholder?: string;
  disabled?: boolean;
  width?: number;
  maxLength?: number;
  onChange?: (value: string) => void;
};

export const Input = (props: inputProps) => {
  const {
    disabled,
    value: valueProp,
    placeholder,
    maxLength,
    width = 260,
    onChange,
  } = props;
  const [value, setValue] = useState<string>(valueProp || '');
  const handleChange: InputHTMLAttributes<HTMLInputElement>['onChange'] = e => {
    setValue(e.target.value);
    onChange && onChange(e.target.value);
  };
  return (
    <StyledInput
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      width={width}
      maxLength={maxLength}
      onChange={handleChange}
    ></StyledInput>
  );
};
