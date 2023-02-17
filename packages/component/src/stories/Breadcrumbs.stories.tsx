/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Link, Typography } from '@mui/material';
import { Meta, Story } from '@storybook/react';
import React from 'react';

import { Breadcrumbs } from '..';

export default {
  title: 'AFFiNE/Breadcrumbs',
  component: Breadcrumbs,
} as Meta;

const Template: Story = args => <Breadcrumbs {...args} />;

export const Primary = Template.bind(undefined);
Primary.args = {
  children: [
    <Link key="1" underline="hover" color="inherit" href="/">
      AFFiNE
    </Link>,
    <Link key="2" underline="hover" color="inherit" href="/Docs/">
      Docs
    </Link>,
    <Typography key="3" color="text.primary">
      Introduction
    </Typography>,
  ],
};
