import React, { useMemo } from 'react';
import { Meta, Story } from '@storybook/react';
import { Button, getLightTheme, ThemeProvider } from '..';

export default {
  title: 'AFFiNE/Button',
  component: Button,
} as Meta;

const Template: Story = args => (
  <ThemeProvider theme={useMemo(() => getLightTheme('page'), [])}>
    <Button {...args} />
  </ThemeProvider>
);

export const Primary = Template.bind({});
Primary.args = {
  type: 'primary',
  children: 'This is a button',
};
