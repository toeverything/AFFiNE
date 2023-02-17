/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Meta, Story } from '@storybook/react';
import React from 'react';

import { Button } from '..';
import { ButtonProps } from '../ui/button/interface';

export default {
  title: 'AFFiNE/Button',
  component: Button,
  argTypes: {
    hoverBackground: { control: 'color' },
    hoverColor: { control: 'color' },
  },
} as Meta<ButtonProps>;

const Template: Story<ButtonProps> = args => <Button {...args} />;

export const Primary = Template.bind(undefined);
Primary.args = {
  type: 'primary',
  children: 'This is a primary button',
};

export const Default = Template.bind(undefined);
Default.args = {
  type: 'default',
  children: 'This is a default button',
};

export const Light = Template.bind(undefined);
Light.args = {
  type: 'light',
  children: 'This is a light button',
};

export const Warning = Template.bind(undefined);
Warning.args = {
  type: 'warning',
  children: 'This is a warning button',
};

export const Danger = Template.bind(undefined);
Danger.args = {
  type: 'danger',
  children: 'This is a danger button',
};
