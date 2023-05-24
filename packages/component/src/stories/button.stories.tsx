/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import type { Meta, StoryFn } from '@storybook/react';
import { useState } from 'react';

import { Button } from '../ui/button/button';
import { DropdownButton } from '../ui/button/dropdown';
import type { ButtonProps } from '../ui/button/interface';
import { Menu } from '../ui/menu/menu';
import { toast } from '../ui/toast/toast';

export default {
  title: 'AFFiNE/Button',
  component: Button,
  argTypes: {
    hoverBackground: { control: 'color' },
    hoverColor: { control: 'color' },
  },
} as Meta<ButtonProps>;

const Template: StoryFn<ButtonProps> = args => <Button {...args} />;

export const Primary = Template.bind(undefined);
Primary.args = {
  type: 'primary',
  children: 'This is a primary button',
  onClick: () => toast('Click button'),
};

export const Default = Template.bind(undefined);
Default.args = {
  type: 'default',
  children: 'This is a default button',
  onClick: () => toast('Click button'),
};

export const Light = Template.bind(undefined);
Light.args = {
  type: 'light',
  children: 'This is a light button',
  onClick: () => toast('Click button'),
};

export const Warning = Template.bind(undefined);
Warning.args = {
  type: 'warning',
  children: 'This is a warning button',
  onClick: () => toast('Click button'),
};

export const Danger = Template.bind(undefined);
Danger.args = {
  type: 'danger',
  children: 'This is a danger button',
  onClick: () => toast('Click button'),
};

export const Dropdown: StoryFn = ({ onClickDropDown, ...props }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DropdownButton onClickDropDown={onClickDropDown} {...props}>
        Dropdown Button
      </DropdownButton>

      <Menu
        visible={open}
        placement="bottom-end"
        trigger={['click']}
        width={235}
        disablePortal={true}
        onClickAway={() => {
          setOpen(false);
        }}
        content={<>Dropdown Menu</>}
      >
        <DropdownButton
          onClick={() => {
            toast('Click button');
            setOpen(false);
          }}
          onClickDropDown={() => setOpen(!open)}
        >
          Dropdown with Menu
        </DropdownButton>
      </Menu>
    </>
  );
};
Dropdown.args = {
  onClick: () => toast('Click button'),
  onClickDropDown: () => toast('Click dropdown'),
};

export const Test: StoryFn<ButtonProps> = () => {
  const [input, setInput] = useState('');
  return (
    <>
      <input
        type="text"
        data-testid="test-input"
        value={input}
        onChange={e => setInput(e.target.value)}
      />
      <Button
        onClick={() => {
          setInput('');
        }}
        data-testid="clear-button"
      >
        clear
      </Button>
    </>
  );
};

Test.storyName = 'Click Test';
