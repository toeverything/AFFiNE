import { CameraIcon } from '@blocksuite/icons';
import type { Meta, StoryFn } from '@storybook/react';

import type { AvatarProps } from './avatar';
import { Avatar } from './avatar';

export default {
  title: 'UI/Avatar',
  component: Avatar,
  argTypes: {
    onClick: () => console.log('Click button'),
  },
} satisfies Meta<AvatarProps>;

const Template: StoryFn<AvatarProps> = args => <Avatar {...args} />;

export const DefaultAvatar: StoryFn<AvatarProps> = Template.bind(undefined);
DefaultAvatar.args = {
  name: 'AFFiNE',
  url: 'https://affine.pro/favicon-96.png',
  size: 50,
};
export const Fallback: StoryFn<AvatarProps> = Template.bind(undefined);
Fallback.args = {
  name: 'AFFiNE',
  size: 50,
};
export const ColorfulFallback: StoryFn<AvatarProps> = Template.bind(undefined);
ColorfulFallback.args = {
  size: 50,
  colorfulFallback: true,
  name: 'blocksuite',
};
export const WithHover: StoryFn<AvatarProps> = Template.bind(undefined);
WithHover.args = {
  size: 50,
  colorfulFallback: true,
  name: 'With Hover',
  hoverIcon: <CameraIcon />,
};

export const WithRemove: StoryFn<AvatarProps> = Template.bind(undefined);
WithRemove.args = {
  size: 50,
  colorfulFallback: true,
  name: 'With Hover',
  hoverIcon: <CameraIcon />,
  removeTooltipOptions: { content: 'This is remove tooltip' },
  avatarTooltipOptions: { content: 'This is avatar tooltip' },
  onRemove: e => {
    console.log('on remove', e);
  },
};
