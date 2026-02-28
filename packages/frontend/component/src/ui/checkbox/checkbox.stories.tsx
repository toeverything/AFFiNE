import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { Checkbox } from './checkbox';

export default {
  title: 'UI/Checkbox',
  component: Checkbox,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
} satisfies Meta<typeof Checkbox>;

export const Basic: StoryFn<typeof Checkbox> = props => {
  const [checked, setChecked] = useState(props.checked);
  const handleChange = (
    _event: React.ChangeEvent<HTMLInputElement>,
    checked: boolean
  ) => {
    setChecked(checked);
    props.onChange?.(_event, checked);
  };
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        justifyContent: 'center',
      }}
    >
      <Checkbox
        style={{ fontSize: 14 }}
        {...props}
        checked={checked}
        onChange={handleChange}
      />
      <Checkbox
        style={{ fontSize: 16 }}
        {...props}
        checked={checked}
        onChange={handleChange}
      />
      <Checkbox
        style={{ fontSize: 18 }}
        {...props}
        checked={checked}
        onChange={handleChange}
      />
      <Checkbox
        style={{ fontSize: 24 }}
        {...props}
        checked={checked}
        onChange={handleChange}
      />
    </div>
  );
};

Basic.args = {
  checked: true,
  disabled: false,
  indeterminate: false,
  onChange: console.log,
};
