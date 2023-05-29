// components/switch.tsx
import { useState } from 'react';

import { styled } from '../../styles';

const StyledLabel = styled('label')(() => {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  };
});
const StyledInput = styled('input')(() => {
  return {
    opacity: 0,
    position: 'absolute',

    '&:checked': {
      '& + span': {
        background: 'var(--affine-primary-color)',
        '&:before': {
          background: 'var(--affine-toggle-circle-background-color)',
          transform: 'translate(100%,-50%)',
        },
      },
    },
  };
});
const StyledSwitch = styled('span')(() => {
  return {
    position: 'relative',
    width: '46px',
    height: '26px',
    background: 'var(--affine-toggle-disable-background-color)',
    borderRadius: '37px',
    transition: '300ms all',
    border: '1px solid var(--affine-black-10)',
    boxShadow: 'var(--affine-toggle-circle-shadow)',
    '&:before': {
      transition: 'all .2s cubic-bezier(0.27, 0.2, 0.25, 1.51)',
      content: '""',
      position: 'absolute',
      width: '20px',
      height: '20px',
      borderRadius: '50%',
      top: '50%',
      border: '1px solid var(--affine-black-10)',
      background: 'var(--affine-white)',
      transform: 'translate(1px, -50%)',
      boxShadow: 'var(--affine-toggle-circle-shadow)',
    },
  };
});

type SwitchProps = {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  children?: React.ReactNode;
};

export const Switch = (props: SwitchProps) => {
  const { checked, onChange, children } = props;
  const [isChecked, setIsChecked] = useState(checked);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newChecked = event.target.checked;
    setIsChecked(newChecked);
    onChange?.(newChecked);
  };

  return (
    <StyledLabel>
      {children}
      <StyledInput
        type="checkbox"
        checked={isChecked}
        onChange={handleChange}
      />
      <StyledSwitch />
    </StyledLabel>
  );
};
