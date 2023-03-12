/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Link, Typography } from '@mui/material';
import { expect } from '@storybook/jest';
import { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';

import { Breadcrumbs } from '..';

export default {
  title: 'AFFiNE/Breadcrumbs',
  component: Breadcrumbs,
} as Meta<typeof Breadcrumbs>;

const Template: StoryFn = args => <Breadcrumbs {...args} />;

export const Primary = Template.bind(undefined);
Primary.play = async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  const text = canvas.getByText('AFFiNE');
  expect(text.getAttribute('data-testid')).toBe('affine');
};
Primary.args = {
  children: [
    <Link
      data-testid="affine"
      key="1"
      underline="hover"
      color="inherit"
      href="/"
    >
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
