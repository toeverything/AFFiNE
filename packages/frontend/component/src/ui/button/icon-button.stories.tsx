import { InformationIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';

import type { IconButtonProps } from './icon-button';
import { IconButton } from './icon-button';
export default {
  title: 'UI/IconButton',
  component: IconButton,
  argTypes: {
    onClick: () => console.log('Click button'),
  },
} satisfies Meta<IconButtonProps>;

const Template: StoryFn<IconButtonProps> = args => <IconButton {...args} />;

export const Plain: StoryFn<IconButtonProps> = Template.bind(undefined);
Plain.args = {
  children: <InformationIcon />,
};

export const Primary: StoryFn<IconButtonProps> = Template.bind(undefined);
Primary.args = {
  type: 'primary',
  icon: <InformationIcon />,
};

export const Disabled: StoryFn<IconButtonProps> = Template.bind(undefined);
Disabled.args = {
  disabled: true,
  icon: <InformationIcon />,
};
export const ExtraSmallSizeButton: StoryFn<IconButtonProps> =
  Template.bind(undefined);
ExtraSmallSizeButton.args = {
  size: 'extraSmall',
  icon: <InformationIcon />,
};
export const SmallSizeButton: StoryFn<IconButtonProps> =
  Template.bind(undefined);
SmallSizeButton.args = {
  size: 'small',
  icon: <InformationIcon />,
};
export const LargeSizeButton: StoryFn<IconButtonProps> =
  Template.bind(undefined);
LargeSizeButton.args = {
  size: 'large',
  icon: <InformationIcon />,
};
