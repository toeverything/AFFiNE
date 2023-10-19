/* deepscan-disable USELESS_ARROW_FUNC_BIND */
import { Breadcrumbs } from '@affine/component';
import { Link, Typography } from '@mui/material';
import { expect } from '@storybook/jest';
import type { Meta, StoryFn } from '@storybook/react';
import { within } from '@storybook/testing-library';
export default {
  title: 'AFFiNE/Breadcrumbs',
  component: Breadcrumbs,
  parameters: {
    chromatic: { disableSnapshot: true },
  },
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
