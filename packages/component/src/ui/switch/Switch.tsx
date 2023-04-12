// components/Switch.tsx
import { styled } from '@affine/component';
import { useState } from 'react';

const StyledLabel = styled('label')(({ theme }) => {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
  };
});
const StyledInput = styled('input')(({ theme }) => {
  return {
    opacity: 0,
    position: 'absolute',

    '&:checked': {
      '& + span': {
        background: '#6880FF',
        '&:before': {
          transform: 'translate(28px, -50%)',
        },
      },
    },
  };
});
const StyledSwitch = styled('span')(() => {
  return {
    position: 'relative',
    width: '60px',
    height: '28px',
    background: '#b3b3b3',
    borderRadius: '32px',
    padding: '4px',
    transition: '300ms all',

    '&:before': {
      transition: '300ms all',
      content: '""',
      position: 'absolute',
      width: '28px',
      height: '28px',
      borderRadius: '35px',
      top: '50%',
      left: '4px',
      background: 'white',
      transform: 'translate(-4px, -50%)',
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
