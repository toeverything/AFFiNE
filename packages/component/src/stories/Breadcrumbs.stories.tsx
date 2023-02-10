/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import React from 'react';
import { Meta, Story } from '@storybook/react';
import { Breadcrumbs } from '..';
import { Link, Typography } from '@mui/material';

export default {
  title: 'AFFiNE/Breadcrumbs',
  component: Breadcrumbs,
} as Meta;

const Template: Story = args => <Breadcrumbs {...args} />;

export const Primary = Template.bind(undefined);
Primary.args = {
  children: [
    <Link underline="hover" color="inherit" href="/">
      AFFiNE
    </Link>,
    <Link underline="hover" color="inherit" href="/Docs/">
      Docs
    </Link>,
    <Typography color="text.primary">Introduction</Typography>,
  ],
};
