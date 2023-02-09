import React, { useMemo } from 'react';
import { Meta, Story } from '@storybook/react';
import { Breadcrumbs, getLightTheme, ThemeProvider } from '..';

export default {
  title: 'AFFiNE/Breadcrumbs',
  component: Breadcrumbs,
} as Meta;

const Template: Story = args => (
  <ThemeProvider theme={useMemo(() => getLightTheme('page'), [])}>
    <Breadcrumbs {...args} />
  </ThemeProvider>
);

export const Primary = Template.bind({});
Primary.args = {
  children: [<span>1</span>, <span>2</span>, <span>3</span>],
};
